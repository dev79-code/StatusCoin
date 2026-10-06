//! Status — reputation-gated Token-2022 transfer hook.
//!
//! Every transfer of a Status-launched token calls `transfer_hook`. The hook looks
//! at the *receiving* wallet only:
//!
//!   * receiver is an exempt pool / curve vault  -> allow   (sells are never blocked)
//!   * gate has an `open_after` time that passed -> allow
//!   * receiver is in the score book             -> allow if score >= min_score and not flagged
//!   * receiver is not in the book (unscored)    -> "probation": allow only while their
//!                                                  balance stays <= probation_cap
//!
//! Scores live in one shared **score book**: a big program-owned hash table
//! (wallet -> score, flags). Using a single fixed account (instead of one PDA per
//! wallet) matters for compatibility: every client — Axiom, Jupiter, wallets — can
//! resolve the hook's extra accounts without reading the receiver's token account,
//! which usually doesn't exist yet on a first buy. It's also ~5x cheaper in rent.
//!
//! Creators can only ever make a gate *more open* (lower min score, add exempt
//! vaults, raise probation cap, set an opening time) — they can never trap holders.

use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{transfer_hook::TransferHookAccount, BaseStateWithExtensions, StateWithExtensions},
    state::Account as SplTokenAccount,
};
use anchor_spl::token_interface::Mint;
use spl_discriminator::SplDiscriminate;
use spl_tlv_account_resolution::{account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

declare_id!("FhCxrWkkKHptVi5zdrT8iHSZTRRjP9E11q9mrTUqNiHR");

pub const REGISTRY_SEED: &[u8] = b"registry";
pub const GATE_SEED: &[u8] = b"gate";
pub const META_SEED: &[u8] = b"extra-account-metas";
pub const MAX_EXEMPT: usize = 6;
pub const MAX_BATCH: usize = 24;

/// Flag bit: wallet is a confirmed bot / bundler / rugger. Always rejected.
pub const FLAG_BLOCKED: u8 = 1 << 0;

#[program]
pub mod status_hook {
    use super::*;

    /// One-time setup: who is allowed to publish scores.
    pub fn init_registry(ctx: Context<InitRegistry>, authority: Pubkey) -> Result<()> {
        let r = &mut ctx.accounts.registry;
        r.admin = ctx.accounts.admin.key();
        r.authority = authority;
        r.book = Pubkey::default();
        r.bump = ctx.bumps.registry;
        Ok(())
    }

    pub fn set_authority(ctx: Context<AdminOnly>, authority: Pubkey) -> Result<()> {
        ctx.accounts.registry.authority = authority;
        Ok(())
    }

    /// Format a pre-allocated, program-owned account as the score book.
    /// (Client creates it with SystemProgram.createAccount — up to 10 MB.)
    pub fn init_book(ctx: Context<InitBook>, capacity: u32) -> Result<()> {
        let book = &ctx.accounts.book;
        require!(capacity > 0, StatusError::BadBook);
        require!(
            book.data_len() >= book::HEADER + capacity as usize * book::ENTRY,
            StatusError::BadBook
        );
        let mut data = book.try_borrow_mut_data()?;
        require!(data[..8] != book::MAGIC, StatusError::BadBook); // no re-init
        book::init(&mut data, capacity);
        ctx.accounts.registry.book = book.key();
        Ok(())
    }

    /// Scorer publishes / updates up to MAX_BATCH wallet scores in one go.
    pub fn set_scores(ctx: Context<SetScores>, entries: Vec<ScoreEntry>) -> Result<()> {
        require!(entries.len() <= MAX_BATCH, StatusError::BatchTooLarge);
        let mut data = ctx.accounts.book.try_borrow_mut_data()?;
        for e in entries.iter() {
            require!(e.score <= 100, StatusError::InvalidScore);
            require!(e.wallet != Pubkey::default(), StatusError::InvalidScore);
            book::upsert(&mut data, &e.wallet, e.score, e.flags)?;
        }
        emit!(ScoresUpdated { count: entries.len() as u32 });
        Ok(())
    }

    /// Called by the token creator (mint authority) right after creating the mint
    /// with the TransferHook extension pointing at this program.
    pub fn create_gate(ctx: Context<CreateGate>, params: GateParams) -> Result<()> {
        require!(params.min_score <= 100, StatusError::InvalidScore);
        require!(params.exempt.len() <= MAX_EXEMPT, StatusError::TooManyExempt);
        let book = ctx.accounts.registry.book;
        require!(book != Pubkey::default(), StatusError::BadBook);

        let g = &mut ctx.accounts.gate;
        g.mint = ctx.accounts.mint.key();
        g.creator = ctx.accounts.creator.key();
        g.book = book;
        g.min_score = params.min_score;
        g.probation_cap = params.probation_cap;
        g.open_after = params.open_after;
        g.exempt = [Pubkey::default(); MAX_EXEMPT];
        for (i, k) in params.exempt.iter().enumerate() {
            g.exempt[i] = *k;
        }
        g.exempt_len = params.exempt.len() as u8;
        g.bump = ctx.bumps.gate;

        let metas = extra_metas(&book)?;
        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)?;

        emit!(GateCreated { mint: g.mint, min_score: g.min_score });
        Ok(())
    }

    /// Creators may only make the gate MORE open. This is the anti-honeypot guarantee.
    pub fn loosen_gate(
        ctx: Context<LoosenGate>,
        new_min_score: Option<u8>,
        new_probation_cap: Option<u64>,
        add_exempt: Option<Pubkey>,
        open_after: Option<i64>,
    ) -> Result<()> {
        let g = &mut ctx.accounts.gate;
        if let Some(m) = new_min_score {
            require!(m <= g.min_score, StatusError::CanOnlyLoosen);
            g.min_score = m;
        }
        if let Some(c) = new_probation_cap {
            require!(c >= g.probation_cap, StatusError::CanOnlyLoosen);
            g.probation_cap = c;
        }
        if let Some(k) = add_exempt {
            let n = g.exempt_len as usize;
            require!(n < MAX_EXEMPT, StatusError::TooManyExempt);
            g.exempt[n] = k;
            g.exempt_len += 1;
        }
        if let Some(t) = open_after {
            require!(t > 0, StatusError::CanOnlyLoosen);
            require!(g.open_after == 0 || t <= g.open_after, StatusError::CanOnlyLoosen);
            g.open_after = t;
        }
        Ok(())
    }

    /// The hook. Invoked by Token-2022 on every `transfer_checked`.
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn transfer_hook(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        assert_is_transferring(&ctx.accounts.source_token.to_account_info())?;

        let gate = &ctx.accounts.gate;
        let (dest_owner, dest_balance_after) =
            read_owner_and_amount(&ctx.accounts.destination_token.to_account_info())?;

        // 1. Sells / deposits into pools & curves always pass.
        if gate.is_exempt(&dest_owner) {
            return Ok(());
        }
        // 2. Gate fully opened.
        if gate.open_after > 0 && Clock::get()?.unix_timestamp >= gate.open_after {
            return Ok(());
        }
        // 3. Look up the receiver in the score book.
        let book_info = &ctx.accounts.score_book;
        require_keys_eq!(book_info.key(), gate.book, StatusError::BadBook);
        require_keys_eq!(*book_info.owner, crate::ID, StatusError::BadBook);
        let data = book_info.try_borrow_data()?;

        match book::get(&data, &dest_owner)? {
            None => {
                // Unscored wallet -> probation.
                require!(
                    gate.probation_cap > 0 && dest_balance_after <= gate.probation_cap,
                    StatusError::NotOnTheList
                );
            }
            Some((score, flags)) => {
                require!(flags & FLAG_BLOCKED == 0, StatusError::Flagged);
                require!(score >= gate.min_score, StatusError::ScoreTooLow);
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------- score book
/// Open-addressing hash table stored in raw account data.
///   header: magic[8] | capacity u32 | count u32
///   entry : wallet[32] | score u8 | flags u8      (empty slot = all-zero wallet)
pub mod book {
    use super::*;

    pub const MAGIC: [u8; 8] = *b"STATBOOK";
    pub const HEADER: usize = 16;
    pub const ENTRY: usize = 34;

    pub fn init(data: &mut [u8], capacity: u32) {
        data[..8].copy_from_slice(&MAGIC);
        data[8..12].copy_from_slice(&capacity.to_le_bytes());
        data[12..16].copy_from_slice(&0u32.to_le_bytes());
    }

    fn header(data: &[u8]) -> Result<(usize, u32)> {
        require!(data.len() >= HEADER && data[..8] == MAGIC, StatusError::BadBook);
        let cap = u32::from_le_bytes(data[8..12].try_into().unwrap()) as usize;
        let count = u32::from_le_bytes(data[12..16].try_into().unwrap());
        require!(cap > 0 && data.len() >= HEADER + cap * ENTRY, StatusError::BadBook);
        Ok((cap, count))
    }

    #[inline]
    fn start(wallet: &Pubkey, cap: usize) -> usize {
        let b = wallet.to_bytes();
        (u64::from_le_bytes(b[..8].try_into().unwrap()) % cap as u64) as usize
    }

    /// Returns (score, flags) or None if the wallet was never scored.
    pub fn get(data: &[u8], wallet: &Pubkey) -> Result<Option<(u8, u8)>> {
        let (cap, _) = header(data)?;
        let key = wallet.to_bytes();
        let mut i = start(wallet, cap);
        for _ in 0..cap {
            let o = HEADER + i * ENTRY;
            let slot = &data[o..o + 32];
            if slot == key {
                return Ok(Some((data[o + 32], data[o + 33])));
            }
            if slot.iter().all(|b| *b == 0) {
                return Ok(None);
            }
            i = (i + 1) % cap;
        }
        Ok(None)
    }

    pub fn upsert(data: &mut [u8], wallet: &Pubkey, score: u8, flags: u8) -> Result<()> {
        let (cap, count) = header(data)?;
        let key = wallet.to_bytes();
        let mut i = start(wallet, cap);
        for _ in 0..cap {
            let o = HEADER + i * ENTRY;
            let is_key = data[o..o + 32] == key;
            let is_empty = !is_key && data[o..o + 32].iter().all(|b| *b == 0);
            if is_key || is_empty {
                if is_empty {
                    // keep load factor <= 85% so probes stay short
                    require!((count as usize + 1) * 100 <= cap * 85, StatusError::BookFull);
                    data[o..o + 32].copy_from_slice(&key);
                    data[12..16].copy_from_slice(&(count + 1).to_le_bytes());
                }
                data[o + 32] = score;
                data[o + 33] = flags;
                return Ok(());
            }
            i = (i + 1) % cap;
        }
        err!(StatusError::BookFull)
    }
}

// ---------------------------------------------------------------- helpers

/// Extra accounts Token-2022 must pass to `transfer_hook`.
/// Execute layout: 0 source, 1 mint, 2 destination, 3 owner, 4 meta list, then:
///   5 = gate PDA     ["gate", mint]   (always resolvable)
///   6 = score book   fixed pubkey     (always resolvable)
pub fn extra_metas(book: &Pubkey) -> Result<Vec<ExtraAccountMeta>> {
    Ok(vec![
        ExtraAccountMeta::new_with_seeds(
            &[Seed::Literal { bytes: GATE_SEED.to_vec() }, Seed::AccountKey { index: 1 }],
            false,
            false,
        )?,
        ExtraAccountMeta::new_with_pubkey(book, false, false)?,
    ])
}

/// Guard against someone calling the hook directly outside a real transfer.
fn assert_is_transferring(source: &AccountInfo) -> Result<()> {
    let data = source.try_borrow_data()?;
    let acc = StateWithExtensions::<SplTokenAccount>::unpack(&data)
        .map_err(|_| error!(StatusError::NotTransferring))?;
    let ext = acc
        .get_extension::<TransferHookAccount>()
        .map_err(|_| error!(StatusError::NotTransferring))?;
    require!(bool::from(ext.transferring), StatusError::NotTransferring);
    Ok(())
}

fn read_owner_and_amount(info: &AccountInfo) -> Result<(Pubkey, u64)> {
    let data = info.try_borrow_data()?;
    let acc = StateWithExtensions::<SplTokenAccount>::unpack(&data)
        .map_err(|_| error!(StatusError::BadTokenAccount))?;
    Ok((acc.base.owner, acc.base.amount))
}

// ---------------------------------------------------------------- accounts

#[derive(Accounts)]
pub struct InitRegistry<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Registry::INIT_SPACE, seeds = [REGISTRY_SEED], bump)]
    pub registry: Account<'info, Registry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [REGISTRY_SEED], bump = registry.bump, has_one = admin)]
    pub registry: Account<'info, Registry>,
}

#[derive(Accounts)]
pub struct InitBook<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [REGISTRY_SEED], bump = registry.bump, has_one = admin)]
    pub registry: Account<'info, Registry>,
    /// CHECK: raw program-owned account formatted as the score book
    #[account(mut, owner = crate::ID)]
    pub book: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SetScores<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [REGISTRY_SEED], bump = registry.bump, has_one = authority, has_one = book)]
    pub registry: Account<'info, Registry>,
    /// CHECK: verified via has_one on registry
    #[account(mut)]
    pub book: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CreateGate<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mint::authority = creator, mint::token_program = anchor_spl::token_2022::ID)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(seeds = [REGISTRY_SEED], bump = registry.bump)]
    pub registry: Account<'info, Registry>,
    #[account(
        init,
        payer = creator,
        space = 8 + GateConfig::INIT_SPACE,
        seeds = [GATE_SEED, mint.key().as_ref()],
        bump
    )]
    pub gate: Account<'info, GateConfig>,
    /// CHECK: TLV list of extra metas, written in `create_gate`.
    #[account(
        init,
        payer = creator,
        space = ExtraAccountMetaList::size_of(2).unwrap(),
        seeds = [META_SEED, mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LoosenGate<'info> {
    pub creator: Signer<'info>,
    #[account(mut, seeds = [GATE_SEED, gate.mint.as_ref()], bump = gate.bump, has_one = creator)]
    pub gate: Account<'info, GateConfig>,
}

/// Account order is fixed by the transfer-hook interface.
#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: source token account (validated in assert_is_transferring)
    pub source_token: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: destination token account (parsed manually)
    pub destination_token: UncheckedAccount<'info>,
    /// CHECK: source owner / delegate
    pub owner: UncheckedAccount<'info>,
    /// CHECK: extra account meta list PDA
    #[account(seeds = [META_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    #[account(seeds = [GATE_SEED, mint.key().as_ref()], bump = gate.bump)]
    pub gate: Account<'info, GateConfig>,
    /// CHECK: verified against gate.book + owner in handler
    pub score_book: UncheckedAccount<'info>,
}

// ---------------------------------------------------------------- state

#[account]
#[derive(InitSpace)]
pub struct Registry {
    pub admin: Pubkey,
    pub authority: Pubkey,
    pub book: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct GateConfig {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub book: Pubkey,
    pub min_score: u8,
    /// Max balance an unscored wallet may hold. 0 = unscored wallets blocked.
    pub probation_cap: u64,
    /// Unix time after which the gate opens to everyone. 0 = never.
    pub open_after: i64,
    /// Owners of pool / curve vaults (sells go here, never blocked).
    pub exempt: [Pubkey; MAX_EXEMPT],
    pub exempt_len: u8,
    pub bump: u8,
}

impl GateConfig {
    pub fn is_exempt(&self, k: &Pubkey) -> bool {
        self.exempt[..self.exempt_len as usize].iter().any(|e| e == k)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GateParams {
    pub min_score: u8,
    pub probation_cap: u64,
    pub open_after: i64,
    pub exempt: Vec<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoreEntry {
    pub wallet: Pubkey,
    pub score: u8,
    pub flags: u8,
}

#[event]
pub struct ScoresUpdated {
    pub count: u32,
}

#[event]
pub struct GateCreated {
    pub mint: Pubkey,
    pub min_score: u8,
}

#[error_code]
pub enum StatusError {
    #[msg("Status: your score is too low for this token")]
    ScoreTooLow,
    #[msg("Status: wallet flagged (bot / bundler / rugger)")]
    Flagged,
    #[msg("Status: unscored wallet over probation limit — get scored first")]
    NotOnTheList,
    #[msg("Score must be 0-100")]
    InvalidScore,
    #[msg("Too many exempt vaults")]
    TooManyExempt,
    #[msg("Creators can only loosen a gate, never tighten it")]
    CanOnlyLoosen,
    #[msg("Hook called outside a transfer")]
    NotTransferring,
    #[msg("Bad token account")]
    BadTokenAccount,
    #[msg("Score book missing or invalid")]
    BadBook,
    #[msg("Score book is full")]
    BookFull,
    #[msg("Too many scores in one batch")]
    BatchTooLarge,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn meta_list_fits_allocated_space() {
        let metas = extra_metas(&Pubkey::new_unique()).unwrap();
        let size = ExtraAccountMetaList::size_of(metas.len()).unwrap();
        let mut buf = vec![0u8; size];
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut buf, &metas).unwrap();
        assert_eq!(metas.len(), 2);
    }

    #[test]
    fn exempt_only_counts_filled_slots() {
        let pool = Pubkey::new_unique();
        let mut g = GateConfig {
            mint: Pubkey::new_unique(),
            creator: Pubkey::new_unique(),
            book: Pubkey::new_unique(),
            min_score: 70,
            probation_cap: 0,
            open_after: 0,
            exempt: [Pubkey::default(); MAX_EXEMPT],
            exempt_len: 0,
            bump: 255,
        };
        assert!(!g.is_exempt(&Pubkey::default()));
        g.exempt[0] = pool;
        g.exempt_len = 1;
        assert!(g.is_exempt(&pool));
        assert!(!g.is_exempt(&Pubkey::new_unique()));
    }

    #[test]
    fn book_upsert_get_and_collisions() {
        let cap = 64u32;
        let mut data = vec![0u8; book::HEADER + cap as usize * book::ENTRY];
        book::init(&mut data, cap);
        let ws: Vec<Pubkey> = (0..50).map(|_| Pubkey::new_unique()).collect();
        for (i, w) in ws.iter().enumerate() {
            book::upsert(&mut data, w, (i % 101) as u8, 0).unwrap();
        }
        for (i, w) in ws.iter().enumerate() {
            assert_eq!(book::get(&data, w).unwrap(), Some(((i % 101) as u8, 0)));
        }
        book::upsert(&mut data, &ws[3], 99, FLAG_BLOCKED).unwrap();
        assert_eq!(book::get(&data, &ws[3]).unwrap(), Some((99, FLAG_BLOCKED)));
        assert_eq!(u32::from_le_bytes(data[12..16].try_into().unwrap()), 50);
        assert_eq!(book::get(&data, &Pubkey::new_unique()).unwrap(), None);
        // load factor guard: 85% of 64 = 54
        for _ in 0..4 {
            book::upsert(&mut data, &Pubkey::new_unique(), 1, 0).unwrap();
        }
        assert!(book::upsert(&mut data, &Pubkey::new_unique(), 1, 0).is_err());
    }
}
