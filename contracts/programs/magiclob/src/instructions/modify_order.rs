// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Modify a resting order's quantity/price without losing queue position.

use crate::engine::order_types::OrderSide;
use crate::errors::MagiCLOBError;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ModifyOrder<'info> {
    pub owner: Signer<'info>,
    /// CHECK: `market` is deliberately not an Anchor `Account<MarketState>` here
    /// to keep the SBPF stack frame under the 4096-byte limit. `owner = crate::ID`
    /// constrains it to a program-owned data account at handoff, and `handle`
    /// re-deserializes and validates `MarketState` (ensure_active) before any
    /// mutation, so no unchecked access occurs.
    #[account(owner = crate::ID)]
    pub market: UncheckedAccount<'info>,
    #[account(mut, seeds = [ORDER_BOOK_SEED, market.key().as_ref()], bump)]
    pub order_book: Box<Account<'info, OrderBookState>>,
    #[account(
        mut,
        seeds = [TRADER_SEED, market.key().as_ref(), owner.key().as_ref()],
        bump,
        constraint = trader.owner == owner.key() @ MagiCLOBError::TraderAuthMismatch,
        constraint = trader.status != TraderStatus::Banned @ MagiCLOBError::InvalidAuthority
    )]
    pub trader: Box<Account<'info, TraderState>>,
}

pub fn handle(
    ctx: Context<ModifyOrder>,
    client_order_id: u64,
    is_bid: bool,
    new_quantity: u64,
    new_price: u64,
) -> Result<()> {
    let mut data: &[u8] = &ctx.accounts.market.data.borrow();
    let market = MarketState::try_deserialize(&mut data)?;
    crate::instructions::ensure_active(&market)?;

    let side = if is_bid { OrderSide::Bid } else { OrderSide::Ask };
    let mut cur = ctx.accounts.order_book.head(side);
    while cur != NONE_IDX {
        let node = ctx.accounts.order_book.pool(side)[cur as usize];
        if node.active
            && node.owner == ctx.accounts.owner.key()
            && node.client_order_id == client_order_id
        {
            require!(
                new_quantity > node.filled_quantity,
                MagiCLOBError::InvalidModifyFilled
            );
            require!(
                new_quantity < node.qty_remaining + node.filled_quantity,
                MagiCLOBError::InvalidModifyQuantity
            );
            require!(
                new_price == 0 || new_price == node.price,
                MagiCLOBError::InvalidModifyPrice
            );
            require!(new_quantity >= market.min_size, MagiCLOBError::InvalidMinSize);
            require!(new_quantity % market.lot_size == 0, MagiCLOBError::InvalidLotSize);
            if new_price > 0 {
                require!(new_price % market.tick_size == 0, MagiCLOBError::InvalidTickSize);
            }

            let mut updated = node;
            updated.qty_remaining = new_quantity - node.filled_quantity;
            ctx.accounts.order_book.pool(side)[cur as usize] = updated;

            emit!(crate::instructions::OrderModified {
                market: ctx.accounts.market.key(),
                order_id: node.sequence,
                client_order_id,
                side,
                price: updated.price,
                previous_quantity: node.qty_remaining,
                new_quantity: updated.qty_remaining,
                owner: ctx.accounts.owner.key(),
            });

            return Ok(());
        }
        cur = node.next;
    }

    Err(MagiCLOBError::OrderNotFound.into())
}
