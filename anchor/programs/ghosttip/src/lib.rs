use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("C7GTb7VYxdrG38MKGPxLGb14X199btYZ5kDerSGiayW5");

#[program]
pub mod ghosttip {
    use super::*;

    pub fn deposit_tip(
        ctx: Context<DepositTip>,
        tip_id: [u8; 32],
        amount: u64,
        expiry_at: i64,
    ) -> Result<()> {
        require!(amount > 0, GhostTipError::InvalidAmount);

        let clock = Clock::get()?;
        require!(
            expiry_at > clock.unix_timestamp,
            GhostTipError::InvalidExpiry
        );

        let sender_key = ctx.accounts.sender.key();
        let authority_key = ctx.accounts.authority_config.authority;
        let escrow_bump = ctx.bumps.tip_escrow;

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.sender.to_account_info(),
                    to: ctx.accounts.tip_escrow.to_account_info(),
                },
            ),
            amount,
        )?;

        let escrow = &mut ctx.accounts.tip_escrow;
        escrow.tip_id = tip_id;
        escrow.sender = sender_key;
        escrow.recipient = Pubkey::default();
        escrow.amount = amount;
        escrow.token_mint = Pubkey::default(); // system = native SOL
        escrow.expiry_at = expiry_at;
        escrow.status = TipStatus::Claimable;
        escrow.authority = authority_key;
        escrow.bump = escrow_bump;
        escrow.created_at = clock.unix_timestamp;

        emit!(TipDeposited {
            tip_id,
            sender: sender_key,
            amount,
            expiry_at,
        });

        Ok(())
    }

    pub fn claim_tip(
        ctx: Context<ClaimTip>,
        _tip_id: [u8; 32],
        recipient: Pubkey,
    ) -> Result<()> {
        require!(
            ctx.accounts.tip_escrow.status == TipStatus::Claimable,
            GhostTipError::InvalidStatus
        );
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.tip_escrow.authority,
            GhostTipError::UnauthorizedClaimer
        );
        require_keys_eq!(
            ctx.accounts.recipient.key(),
            recipient,
            GhostTipError::UnauthorizedClaimer
        );

        let amount = ctx.accounts.tip_escrow.amount;
        let tip_id = ctx.accounts.tip_escrow.tip_id;
        require!(
            ctx.accounts.tip_escrow.to_account_info().lamports() >= amount,
            GhostTipError::InsufficientFunds
        );

        // PDA-signed native SOL transfer to recipient.
        **ctx
            .accounts
            .tip_escrow
            .to_account_info()
            .try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .recipient
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        let escrow = &mut ctx.accounts.tip_escrow;
        escrow.recipient = recipient;
        escrow.status = TipStatus::Claimed;

        emit!(TipClaimed {
            tip_id,
            recipient,
            amount,
        });

        Ok(())
    }

    pub fn refund_tip(ctx: Context<RefundTip>, _tip_id: [u8; 32]) -> Result<()> {
        require!(
            ctx.accounts.tip_escrow.status == TipStatus::Claimable,
            GhostTipError::InvalidStatus
        );
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.tip_escrow.authority,
            GhostTipError::UnauthorizedClaimer
        );
        require_keys_eq!(
            ctx.accounts.sender.key(),
            ctx.accounts.tip_escrow.sender,
            GhostTipError::UnauthorizedClaimer
        );

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= ctx.accounts.tip_escrow.expiry_at,
            GhostTipError::NotExpiredYet
        );

        let amount = ctx.accounts.tip_escrow.amount;
        let tip_id = ctx.accounts.tip_escrow.tip_id;
        let sender_key = ctx.accounts.tip_escrow.sender;
        require!(
            ctx.accounts.tip_escrow.to_account_info().lamports() >= amount,
            GhostTipError::InsufficientFunds
        );

        **ctx
            .accounts
            .tip_escrow
            .to_account_info()
            .try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .sender
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        ctx.accounts.tip_escrow.status = TipStatus::Refunded;

        emit!(TipRefunded {
            tip_id,
            sender: sender_key,
            amount,
        });

        Ok(())
    }

    pub fn cancel_tip(ctx: Context<CancelTip>, _tip_id: [u8; 32]) -> Result<()> {
        require!(
            ctx.accounts.tip_escrow.status == TipStatus::Claimable,
            GhostTipError::InvalidStatus
        );
        require_keys_eq!(
            ctx.accounts.sender.key(),
            ctx.accounts.tip_escrow.sender,
            GhostTipError::UnauthorizedClaimer
        );

        let amount = ctx.accounts.tip_escrow.amount;
        let tip_id = ctx.accounts.tip_escrow.tip_id;
        let sender_key = ctx.accounts.tip_escrow.sender;
        require!(
            ctx.accounts.tip_escrow.to_account_info().lamports() >= amount,
            GhostTipError::InsufficientFunds
        );

        **ctx
            .accounts
            .tip_escrow
            .to_account_info()
            .try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .sender
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        ctx.accounts.tip_escrow.status = TipStatus::Cancelled;

        emit!(TipCancelled {
            tip_id,
            sender: sender_key,
            amount,
        });

        Ok(())
    }

    pub fn init_authority(ctx: Context<InitAuthority>, authority: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.authority_config;
        require_keys_eq!(cfg.authority, Pubkey::default(), GhostTipError::InvalidStatus);
        cfg.authority = authority;
        cfg.bump = ctx.bumps.authority_config;
        Ok(())
    }
}

/* -------------------------------------------------------------------------- */
/*                                 Accounts                                   */
/* -------------------------------------------------------------------------- */

#[account]
pub struct TipEscrow {
    pub tip_id: [u8; 32],
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub token_mint: Pubkey,
    pub expiry_at: i64,
    pub created_at: i64,
    pub status: TipStatus,
    pub authority: Pubkey,
    pub bump: u8,
}

impl TipEscrow {
    // 32 (tip_id) + 32 + 32 + 8 + 32 + 8 + 8 + 1 + 32 + 1
    pub const LEN: usize = 32 + 32 + 32 + 8 + 32 + 8 + 8 + 1 + 32 + 1;
}

#[account]
pub struct AuthorityConfig {
    pub authority: Pubkey,
    pub bump: u8,
}

impl AuthorityConfig {
    pub const LEN: usize = 32 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum TipStatus {
    Claimable,
    Claimed,
    Refunded,
    Cancelled,
}

/* -------------------------------------------------------------------------- */
/*                              Instruction Accounts                          */
/* -------------------------------------------------------------------------- */

#[derive(Accounts)]
#[instruction(tip_id: [u8; 32])]
pub struct DepositTip<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(
        init,
        payer = sender,
        space = 8 + TipEscrow::LEN,
        seeds = [b"tip_escrow", tip_id.as_ref()],
        bump,
    )]
    pub tip_escrow: Account<'info, TipEscrow>,

    #[account(
        seeds = [b"authority"],
        bump = authority_config.bump,
    )]
    pub authority_config: Account<'info, AuthorityConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(tip_id: [u8; 32])]
pub struct ClaimTip<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: recipient wallet, lamports credited here. Signer not required —
    /// claim authority is the backend keypair. Recipient identity is
    /// enforced off-chain via X OAuth + wallet signature challenge.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"tip_escrow", tip_id.as_ref()],
        bump = tip_escrow.bump,
    )]
    pub tip_escrow: Account<'info, TipEscrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(tip_id: [u8; 32])]
pub struct RefundTip<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: sender wallet, lamports credited back here.
    #[account(mut)]
    pub sender: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"tip_escrow", tip_id.as_ref()],
        bump = tip_escrow.bump,
    )]
    pub tip_escrow: Account<'info, TipEscrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(tip_id: [u8; 32])]
pub struct CancelTip<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(
        mut,
        seeds = [b"tip_escrow", tip_id.as_ref()],
        bump = tip_escrow.bump,
    )]
    pub tip_escrow: Account<'info, TipEscrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitAuthority<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + AuthorityConfig::LEN,
        seeds = [b"authority"],
        bump,
    )]
    pub authority_config: Account<'info, AuthorityConfig>,

    pub system_program: Program<'info, System>,
}

/* -------------------------------------------------------------------------- */
/*                                   Events                                   */
/* -------------------------------------------------------------------------- */

#[event]
pub struct TipDeposited {
    pub tip_id: [u8; 32],
    pub sender: Pubkey,
    pub amount: u64,
    pub expiry_at: i64,
}

#[event]
pub struct TipClaimed {
    pub tip_id: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TipRefunded {
    pub tip_id: [u8; 32],
    pub sender: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TipCancelled {
    pub tip_id: [u8; 32],
    pub sender: Pubkey,
    pub amount: u64,
}

/* -------------------------------------------------------------------------- */
/*                                   Errors                                   */
/* -------------------------------------------------------------------------- */

#[error_code]
pub enum GhostTipError {
    #[msg("Tip is not in a valid status for this operation")]
    InvalidStatus,
    #[msg("Tip has not expired yet")]
    NotExpiredYet,
    #[msg("Tip has already been claimed")]
    AlreadyClaimed,
    #[msg("Signer is not authorised to perform this action")]
    UnauthorizedClaimer,
    #[msg("Escrow has insufficient funds")]
    InsufficientFunds,
    #[msg("Invalid expiry timestamp")]
    InvalidExpiry,
    #[msg("Invalid tip id")]
    InvalidTipId,
    #[msg("Invalid amount")]
    InvalidAmount,
}
