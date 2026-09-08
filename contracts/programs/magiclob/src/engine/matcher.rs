// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! The core price-time priority matching engine.
//!
//! Terms
//! 
//! Aggressive / taker - the order being executed by the instruction.
//! Resting / maker - orders already on the book.
//!
//! Algorithm (per aggressive order) - see `execute`:
//!
//! 1. Sweep the head of the opposite side while the price crosses
//!    (`bid >= ask` / `ask <= bid`), FIFO within a price.
//! 2. For each fill settle taker + maker virtual balances and fees.
//! 3. Fully filled makers are popped and their slots recycled.
//! 4. Unmatched quantity of a *limit* order rests (price-time priority).
//!    Unmatched quantity of a *market* order is discarded.
//!
//! All balance and fee arithmetic is checked; any overflow or insufficient
//! balance reverts the entire instruction (all-or-nothing tx semantics).

pub use crate::engine::price_level;
use crate::engine::order_types::{MatchReport, NONE_IDX, OrderNode, OrderSide, MAX_ORDERS_PER_SIDE};
use crate::errors::MagiCLOBError;
use crate::fees::fee_amount;
use crate::state::market::MarketState;
use crate::state::order_book::OrderBookState;
use crate::state::trader::trader_pda;
use crate::state::trader::TraderState;
use anchor_lang::prelude::*;

/// 10^decimals as u128: converts base-raw quantity to quote-raw money given the
/// market's price convention (quote raw per whole base token).
fn base_scale(decimals: u8) -> std::result::Result<u128, MagiCLOBError> {
    match 10u128.checked_pow(u32::from(decimals)) {
        Some(scale) => Ok(scale),
        None => Err(MagiCLOBError::ArithmeticOverflow),
    }
}

/// Specification of the aggressive order fed into `execute`.
#[derive(Clone, Copy, Debug)]
pub struct Incoming {
    /// True for a bid (buy).
    pub is_bid: bool,
    /// True for a market-shaped order (`price` is irrelevant).
    pub is_market: bool,
    /// Limit price.
    pub price: u64,
    /// Quantity in base units.
    pub qty: u64,
    pub client_order_id: u64,
    /// Owner/authorizer (matches `TraderState.owner`).
    pub owner: Pubkey,
    /// Integrator to credit on behalf of whatever this order rests.
    pub integrator: Pubkey,
    pub integrator_fee_bps: u16,
    /// Time-in-force governing execution behavior.
    pub time_in_force: crate::engine::order_types::TimeInForce,
    /// Self-trade prevention mode.
    pub self_matching_option: crate::engine::order_types::SelfMatchingOption,
    /// Expiration timestamp in Unix seconds. Order is invalid after this time.
    pub expire_timestamp: u64,
    /// Clock timestamp at order entry, used for expiry checks.
    pub clock_timestamp: u64,
}

/// A pending net balance transfer to the aggressive (taker) trader.
#[derive(Clone, Copy, Debug, Default)]
pub struct TakerDelta {
    pub base_delta: i128,
    pub quote_delta: i128,
}

/// A pending net balance transfer to a resting (maker) trader.
#[derive(Clone, Copy, Debug)]
pub struct MakerDelta {
    pub owner: Pubkey,
    pub base_delta: i128,
    pub quote_delta: i128,
    pub maker_fee_paid: u64,
}

#[derive(Debug, Default)]
pub struct MakerDeltas {
    pub entries: Vec<MakerDelta>,
}

impl MakerDeltas {
    fn push(&mut self, owner: Pubkey, base_delta: i128, quote_delta: i128, maker_fee_paid: u64) {
        if let Some(e) = self.entries.iter_mut().find(|e| e.owner == owner) {
            e.base_delta += base_delta;
            e.quote_delta += quote_delta;
            e.maker_fee_paid = e.maker_fee_paid.saturating_add(maker_fee_paid);
        } else {
            self.entries.push(MakerDelta {
                owner,
                base_delta,
                quote_delta,
                maker_fee_paid,
            });
        }
    }
}

// Slot pool + linked-list plumbing (on `OrderBookState`)

impl OrderBookState {
    pub(crate) fn pool(&mut self, side: OrderSide) -> &mut [OrderNode; MAX_ORDERS_PER_SIDE] {
        match side {
            OrderSide::Bid => &mut self.bids,
            OrderSide::Ask => &mut self.asks,
        }
    }

    pub(crate) fn head(&self, side: OrderSide) -> u16 {
        match side {
            OrderSide::Bid => self.bid_head,
            OrderSide::Ask => self.ask_head,
        }
    }

    pub(crate) fn set_head(&mut self, side: OrderSide, v: u16) {
        match side {
            OrderSide::Bid => self.bid_head = v,
            OrderSide::Ask => self.ask_head = v,
        }
    }

    pub(crate) fn free_head(&self, side: OrderSide) -> u16 {
        match side {
            OrderSide::Bid => self.bid_free,
            OrderSide::Ask => self.ask_free,
        }
    }

    pub(crate) fn set_free_head(&mut self, side: OrderSide, v: u16) {
        match side {
            OrderSide::Bid => self.bid_free = v,
            OrderSide::Ask => self.ask_free = v,
        }
    }

    pub(crate) fn count(&self, side: OrderSide) -> u16 {
        match side {
            OrderSide::Bid => self.bid_count,
            OrderSide::Ask => self.ask_count,
        }
    }

    pub(crate) fn set_count(&mut self, side: OrderSide, v: u16) {
        match side {
            OrderSide::Bid => self.bid_count = v,
            OrderSide::Ask => self.ask_count = v,
        }
    }

    /// Allocates a free slot on a side, or returns capacity error.
    pub(crate) fn allocate(&mut self, side: OrderSide) -> std::result::Result<u16, MagiCLOBError> {
        let free = self.free_head(side);
        if free != NONE_IDX {
            let next_free = self.pool(side)[free as usize].next;
            self.set_free_head(side, next_free);
            return Ok(free);
        }
        let count = self.count(side) as usize;
        if count >= MAX_ORDERS_PER_SIDE {
            return Err(MagiCLOBError::BookCapacityReached);
        }
        self.set_count(side, (count + 1) as u16);
        Ok(count as u16)
    }

    /// Releases a slot back to the side's free stack.
    pub(crate) fn release(&mut self, side: OrderSide, slot: u16) {
        let free = self.free_head(side);
        let node = &mut self.pool(side)[slot as usize];
        node.active = false;
        node.next = free;
        node.prev = NONE_IDX;
        self.set_free_head(side, slot);
    }

    /// Unlinks `slot` from the side's doubly linked list.
    pub(crate) fn unlink(&mut self, side: OrderSide, slot: u16) {
        let (prev, next) = {
            let n = &mut self.pool(side)[slot as usize];
            (n.prev, n.next)
        };
        if prev != NONE_IDX {
            self.pool(side)[prev as usize].next = next;
        } else {
            self.set_head(side, next);
        }
        if next != NONE_IDX {
            self.pool(side)[next as usize].prev = prev;
        }
        let n = &mut self.pool(side)[slot as usize];
        n.prev = NONE_IDX;
        n.next = NONE_IDX;
    }

    /// Links `slot` immediately after `anchor` (which must be on the same side).
    pub(crate) fn link_after(&mut self, side: OrderSide, anchor: u16, slot: u16) {
        let anchor_next = self.pool(side)[anchor as usize].next;
        self.pool(side)[slot as usize].prev = anchor;
        self.pool(side)[slot as usize].next = anchor_next;
        self.pool(side)[anchor as usize].next = slot;
        if anchor_next != NONE_IDX {
            self.pool(side)[anchor_next as usize].prev = slot;
        }
    }

    /// Links `slot` immediately before `anchor` (which must be on the same side),
    /// updating the head if needed.
    pub(crate) fn link_before(&mut self, side: OrderSide, anchor: u16, slot: u16) {
        let anchor_prev = self.pool(side)[anchor as usize].prev;
        self.pool(side)[slot as usize].prev = anchor_prev;
        self.pool(side)[slot as usize].next = anchor;
        self.pool(side)[anchor as usize].prev = slot;
        if anchor_prev != NONE_IDX {
            self.pool(side)[anchor_prev as usize].next = slot;
        } else {
            self.set_head(side, slot);
        }
    }

    /// Pops the head-of-list slot, frees it, and returns it.
    pub(crate) fn pop_head(&mut self, side: OrderSide) -> std::result::Result<u16, MagiCLOBError> {
        let head = self.head(side);
        if head == NONE_IDX {
            return Ok(NONE_IDX);
        }
        self.unlink(side, head);
        self.release(side, head);
        Ok(head)
    }

    }

/// Inserts a resting order into the proper side maintaining
/// price-time priority (bids price desc then FIFO; asks price asc then FIFO).
fn rest_order(
    book: &mut OrderBookState,
    side: OrderSide,
    price: u64,
    qty_remaining: u64,
    owner: Pubkey,
    integrator: Pubkey,
    integrator_fee_bps: u16,
    client_order_id: u64,
    expire_timestamp: u64,
    time_in_force: crate::engine::order_types::TimeInForce,
    self_matching_option: crate::engine::order_types::SelfMatchingOption,
) -> std::result::Result<u16, MagiCLOBError> {
    let slot = book.allocate(side)?;
    let node = OrderNode {
        active: true,
        side,
        price,
        qty_remaining,
        owner,
        integrator,
        integrator_fee_bps,
        client_order_id,
        sequence: book.order_sequence,
        prev: NONE_IDX,
        next: NONE_IDX,
        expire_timestamp,
        time_in_force,
        self_matching_option,
        filled_quantity: 0,
    };
    book.order_sequence = book.order_sequence.wrapping_add(1);
    book.pool(side)[slot as usize] = node;

    let head = book.head(side);
    if head == NONE_IDX {
        book.set_head(side, slot);
        return Ok(slot);
    }

    // Find the first node that is strictly worse than the new order.
    // Equal-price nodes are walked past so the new order lands after every
    // earlier order at the same price (FIFO).
    let mut cur = head;
    loop {
        let cur_node = book.pool(side)[cur as usize];
        let strictly_worse = match side {
            OrderSide::Bid => cur_node.price < node.price,
            OrderSide::Ask => cur_node.price > node.price,
        };
        if strictly_worse {
            break;
        }
        if cur_node.next == NONE_IDX {
            // Every existing node is better or equal: new order is tail.
            book.link_after(side, cur, slot);
            return Ok(slot);
        }
        cur = cur_node.next;
    }

    book.link_before(side, cur, slot);
    Ok(slot)
}

/// Finds and cancels a resting order identified by owner + client order id.
pub fn cancel_order(
    book: &mut OrderBookState,
    side: OrderSide,
    owner: &Pubkey,
    client_order_id: u64,
) -> std::result::Result<OrderNode, MagiCLOBError> {
    let mut cur = book.head(side);
    while cur != NONE_IDX {
        let node = book.pool(side)[cur as usize];
        if node.active && node.owner == *owner && node.client_order_id == client_order_id {
            book.unlink(side, cur);
            book.release(side, cur);
            return Ok(node);
        }
        cur = node.next;
    }
    Err(MagiCLOBError::OrderNotFound)
}

// Matching

/// Executes one aggressive order against the book.
///
/// Returns the fill report (emitted as an event) and the net transfers owed to
/// resting (maker) traders, which the caller applies to the makers' `TraderState`
/// accounts in `remaining_accounts`.
pub fn execute(
    book: &mut OrderBookState,
    market: &mut MarketState,
    _taker: &TraderState,
    incoming: &Incoming,
) -> std::result::Result<(MatchReport, TakerDelta, MakerDeltas), MagiCLOBError> {
    use crate::engine::order_types::{Fill, MatchReport, SelfMatchingOption, TimeInForce};

    if incoming.qty == 0 {
        return Err(MagiCLOBError::InvalidQuantity);
    }
    if !incoming.is_market && incoming.price == 0 {
        return Err(MagiCLOBError::InvalidPrice);
    }
    if incoming.clock_timestamp > incoming.expire_timestamp {
        return Err(MagiCLOBError::OrderExpired);
    }

    let opposing = match incoming.is_bid {
        true => OrderSide::Ask,
        false => OrderSide::Bid,
    };

    let mut report = MatchReport {
        is_bid: incoming.is_bid,
        taker_order_id: book.order_sequence,
        ..Default::default()
    };
    book.order_sequence = book.order_sequence.wrapping_add(1);

    let mut deltas = MakerDeltas::default();
    let mut taker_base_delta: i128 = 0;
    let mut taker_quote_delta: i128 = 0;
    let mut remaining = incoming.qty;
    // Uncscaled Σ(fill_qty × price) used only to derive the reported VWAP in
    // market price units; money/fee arithmetic uses the scaled notional.
    let mut weighted_notional: u128 = 0;

    // PostOnly: reject if the order would take liquidity.
    if incoming.time_in_force == TimeInForce::PostOnly && !incoming.is_market {
        let head_slot = book.head(opposing);
        if head_slot != NONE_IDX {
            let head_node = book.pool(opposing)[head_slot as usize];
            let would_cross = if incoming.is_bid {
                head_node.price <= incoming.price
            } else {
                head_node.price >= incoming.price
            };
            if would_cross {
                return Err(MagiCLOBError::PostOnlyWouldCross);
            }
        }
    }

    loop {
        let head_slot = book.head(opposing);
        if head_slot == NONE_IDX {
            break;
        }
        let node = book.pool(opposing)[head_slot as usize];
        if !node.active {
            break;
        }

        // Skip expired makers.
        if incoming.clock_timestamp > node.expire_timestamp {
            book.pop_head(opposing)?;
            report.order_expired = true;
            continue;
        }

        let crossed = if incoming.is_bid {
            node.price <= incoming.price
        } else {
            node.price >= incoming.price
        };
        if !crossed {
            break;
        }

        // Self-trade prevention.
        if node.owner == incoming.owner {
            report.self_trade = true;
            match incoming.self_matching_option {
                SelfMatchingOption::CancelTaker => {
                    break;
                }
                SelfMatchingOption::CancelMaker => {
                    book.pop_head(opposing)?;
                    continue;
                }
                SelfMatchingOption::Allowed => {}
            }
        }

        let fill_qty = remaining.min(node.qty_remaining);
        let raw_notional = (fill_qty as u128) * (node.price as u128);
        // Prices are quote-raw per *whole* base token (SOL/USDC mid 95.00 USDC
        // → 95_000_000) while `fill_qty` is in base raw units (lamports), so the
        // real-money notional is scaled down by the base-token decimals.
        let scaled_notional = raw_notional
            .checked_div(base_scale(market.base_decimals)?)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        let notional_u64 =
            u64::try_from(scaled_notional).map_err(|_| MagiCLOBError::ArithmeticOverflow)?;
        weighted_notional = weighted_notional
            .checked_add(raw_notional)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;

        let taker_fee = fee_amount(notional_u64, market.current_taker_fee_bps)?;
        let mut maker_fee = fee_amount(notional_u64, market.current_maker_fee_bps)?;
        if maker_fee > 0 && market.maker_rebate_bps > 0 {
            let rebate = fee_amount(maker_fee, market.maker_rebate_bps)?;
            maker_fee = maker_fee
                .checked_sub(rebate)
                .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        }
        let integrator_bps = node.integrator_fee_bps.min(market.integrator_fee_bps_cap);
        let integrator_fee = fee_amount(notional_u64, integrator_bps)?;

        if incoming.is_bid {
            let taker_cost = notional_u64
                .checked_add(taker_fee)
                .and_then(|v| v.checked_add(integrator_fee))
                .ok_or(MagiCLOBError::ArithmeticOverflow)?;
            taker_base_delta += fill_qty as i128;
            taker_quote_delta -= taker_cost as i128;
            let maker_credit = notional_u64
                .checked_sub(maker_fee)
                .ok_or(MagiCLOBError::ArithmeticOverflow)?;
            deltas.push(node.owner, -(fill_qty as i128), maker_credit as i128, maker_fee);
        } else {
            taker_base_delta -= fill_qty as i128;
            let taker_credit = notional_u64
                .checked_sub(taker_fee)
                .and_then(|v| v.checked_sub(integrator_fee))
                .ok_or(MagiCLOBError::ArithmeticOverflow)?;
            taker_quote_delta += taker_credit as i128;
            let maker_cost = notional_u64
                .checked_add(maker_fee)
                .ok_or(MagiCLOBError::ArithmeticOverflow)?;
            deltas.push(node.owner, fill_qty as i128, -(maker_cost as i128), maker_fee);
        }

        market.accumulated_fees = market
            .accumulated_fees
            .checked_add(taker_fee)
            .and_then(|v| v.checked_add(maker_fee))
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        market.accumulated_integrator_fees = market
            .accumulated_integrator_fees
            .checked_add(integrator_fee)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;

        report.total_base_filled = report
            .total_base_filled
            .checked_add(fill_qty)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        report.total_quote_filled = report
            .total_quote_filled
            .checked_add(notional_u64)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        report.taker_fee_total = report
            .taker_fee_total
            .checked_add(taker_fee)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        report.maker_fee_total = report
            .maker_fee_total
            .checked_add(maker_fee)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        report.integrator_fee_total = report
            .integrator_fee_total
            .checked_add(integrator_fee)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
        report.fills.push(Fill {
            price: node.price,
            qty: fill_qty,
            maker_order_id: node.sequence,
            maker: node.owner,
            maker_fee,
        });

        remaining -= fill_qty;

        // Update or recycle the maker slot.
        if node.qty_remaining == fill_qty {
            book.pop_head(opposing)?;
        } else {
            let mut updated = node;
            updated.qty_remaining -= fill_qty;
            updated.filled_quantity += fill_qty;
            book.pool(opposing)[head_slot as usize] = updated;
        }

        if remaining == 0 {
            break;
        }
    }

    // Time-in-force handling for uncovered quantity.
    if remaining > 0 {
        match incoming.time_in_force {
            TimeInForce::FillOrKill => {
                return Err(MagiCLOBError::FillOrKillNotFilled);
            }
            TimeInForce::ImmediateOrCancel => {
                report.remaining_base = remaining;
            }
            TimeInForce::GoodTillCancelled | TimeInForce::PostOnly => {
                if !incoming.is_market {
                    let side = if incoming.is_bid { OrderSide::Bid } else { OrderSide::Ask };
                    rest_order(
                        book,
                        side,
                        incoming.price,
                        remaining,
                        incoming.owner,
                        incoming.integrator,
                        incoming.integrator_fee_bps,
                        incoming.client_order_id,
                        incoming.expire_timestamp,
                        incoming.time_in_force,
                        incoming.self_matching_option,
                    )?;
                }
                report.remaining_base = remaining;
            }
        }
    }

    if report.total_base_filled > 0 {
        report.avg_fill_price =
            u64::try_from(weighted_notional / (report.total_base_filled as u128))
                .map_err(|_| MagiCLOBError::ArithmeticOverflow)?;
    }

    let taker_delta = TakerDelta {
        base_delta: taker_base_delta,
        quote_delta: taker_quote_delta,
    };

    Ok((report, taker_delta, deltas))
}

/// Applies maker deltas owed to the taker's own account (a self-cross). Runs
/// *before* the aggressive-leg affordability check in `settle` so an Allowed
/// self-trade nets out to just fees.
fn apply_own_maker_deltas(deltas: &MakerDeltas, taker: &mut TraderState) -> Result<()> {
    for d in &deltas.entries {
        if d.owner == taker.owner {
            apply_delta(taker, *d, 0)?;
        }
    }
    Ok(())
}

/// Applies maker deltas to their respective third-party `TraderState` accounts
/// (passed via `remaining_accounts`) and tracks `epoch_maker_fees_paid`.
fn apply_foreign_maker_deltas<'info>(
    deltas: &MakerDeltas,
    market: &Pubkey,
    taker_owner: &Pubkey,
    remaining_accounts: &'info [AccountInfo<'info>],
) -> Result<()> {
    let expected_accounts: Vec<Pubkey> = deltas
        .entries
        .iter()
        .filter(|delta| delta.owner != *taker_owner)
        .map(|delta| trader_pda(market, &delta.owner).0)
        .collect();

    if remaining_accounts.len() != expected_accounts.len() {
        return err!(MagiCLOBError::UnexpectedMakerAccount);
    }

    for info in remaining_accounts {
        let key = info.key();
        if !expected_accounts.contains(&key) {
            return err!(MagiCLOBError::UnexpectedMakerAccount);
        }
        if remaining_accounts
            .iter()
            .filter(|other| other.key() == key)
            .count()
            != 1
        {
            return err!(MagiCLOBError::DuplicateMakerAccount);
        }
    }

    for d in &deltas.entries {
        if d.owner == *taker_owner {
            continue;
        }
        let pda = trader_pda(market, &d.owner).0;
        let info = remaining_accounts
            .iter()
            .find(|info| info.key() == pda)
            .ok_or(MagiCLOBError::MakerAccountMissing)?;
        let mut acc = Account::<TraderState>::try_from(info)?;
        let maker_fee_paid = u64::try_from(-d.quote_delta).unwrap_or(0);
        apply_delta(&mut acc, *d, maker_fee_paid)?;
        acc.exit(&crate::ID)?;
    }
    Ok(())
}

fn apply_delta(trader: &mut TraderState, d: MakerDelta, maker_fee_paid: u64) -> Result<()> {
    let base = trader.base_balance as i128 + d.base_delta;
    let quote = trader.quote_balance as i128 + d.quote_delta;
    if base < 0 || quote < 0 {
        return err!(MagiCLOBError::InsufficientBalance);
    }
    trader.base_balance =
        u64::try_from(base).map_err(|_| MagiCLOBError::ArithmeticOverflow)?;
    trader.quote_balance =
        u64::try_from(quote).map_err(|_| MagiCLOBError::ArithmeticOverflow)?;
    let total_fee = d.maker_fee_paid.max(maker_fee_paid);
    if total_fee > 0 {
        trader.epoch_maker_fees_paid = trader
            .epoch_maker_fees_paid
            .checked_add(total_fee)
            .ok_or(MagiCLOBError::ArithmeticOverflow)?;
    }
    Ok(())
}

/// Applies the taker delta and all maker deltas to their respective `TraderState`
/// accounts. This is the vault-style settlement step: `execute()` only computes
/// deltas, and this function commits them atomically.
pub fn settle<'info>(
    market: &Pubkey,
    taker: &mut TraderState,
    taker_delta: TakerDelta,
    deltas: &MakerDeltas,
    remaining_accounts: &'info [AccountInfo<'info>],
) -> Result<()> {
    // Self-trade: the aggressive order may match the same trader's resting
    // orders (`SelfMatchingOption::Allowed`). Apply those legs first so the
    // affordability check runs against the *net* position — an Allowed
    // self-cross then only owes fees, not the full notional.
    apply_own_maker_deltas(deltas, taker)?;

    let base = taker.base_balance as i128 + taker_delta.base_delta;
    let quote = taker.quote_balance as i128 + taker_delta.quote_delta;
    if base < 0 || quote < 0 {
        return err!(MagiCLOBError::InsufficientBalance);
    }
    taker.base_balance =
        u64::try_from(base).map_err(|_| MagiCLOBError::ArithmeticOverflow)?;
    taker.quote_balance =
        u64::try_from(quote).map_err(|_| MagiCLOBError::ArithmeticOverflow)?;

    let taker_owner = taker.owner;
    apply_foreign_maker_deltas(deltas, market, &taker_owner, remaining_accounts)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::order_types::{SelfMatchingOption, TimeInForce};
    use crate::state::market::{MarketStatus, MarketState};
    use crate::state::trader::TraderStatus;

    fn pk(b: u8) -> Pubkey {
        Pubkey::from([b; 32])
    }


    fn market() -> MarketState {
        MarketState {
            authority: pk(3),
            base_mint: pk(3),
            quote_mint: pk(3),
            taker_fee_bps: 5,
            maker_fee_bps: 0,
            integrator_fee_bps_cap: 100,
            status: MarketStatus::Active,
            accumulated_fees: 0,
            accumulated_integrator_fees: 0,
            bump: 255,
            ..Default::default()
        }
    }

    fn trader(quote: u64, base: u64) -> TraderState {
        TraderState {
            owner: pk(1),
            base_balance: base,
            quote_balance: quote,
            status: TraderStatus::Active,
            bump: 255,
            ..Default::default()
        }
    }

    fn incoming(is_bid: bool, price: u64, qty: u64) -> Incoming {
        Incoming {
            is_bid,
            is_market: false,
            price,
            qty,
            client_order_id: 1,
            owner: pk(1),
            integrator: pk(3),
            integrator_fee_bps: 0,
            time_in_force: TimeInForce::GoodTillCancelled,
            self_matching_option: SelfMatchingOption::Allowed,
            expire_timestamp: u64::MAX,
            clock_timestamp: 0,
        }
    }

    fn rest_order(
        book: &mut OrderBookState,
        side: OrderSide,
        price: u64,
        qty: u64,
        owner: Pubkey,
        integrator: Pubkey,
        integrator_fee_bps: u16,
        client_order_id: u64,
    ) -> std::result::Result<u16, MagiCLOBError> {
        super::rest_order(
            book,
            side,
            price,
            qty,
            owner,
            integrator,
            integrator_fee_bps,
            client_order_id,
            u64::MAX,
            TimeInForce::GoodTillCancelled,
            SelfMatchingOption::Allowed,
        )
    }

    #[test]
    fn bid_rest_and_ask_sweep_price_time() {
        let mut book = OrderBookState::default();
        rest_order(&mut book, OrderSide::Bid, 100, 5, pk(1), pk(3), 0, 1).unwrap();
        rest_order(&mut book, OrderSide::Bid, 100, 4, pk(2), pk(3), 0, 2).unwrap();
        rest_order(&mut book, OrderSide::Bid, 90, 9, pk(1), pk(3), 0, 3).unwrap();

        // FIFO at 100: pk(1)(1) first.
        let mut m = market();
        let t = trader(50_000, 100);
        let (report, taker_delta, deltas) = execute(&mut book, &mut m, &t, &incoming(false, 100, 8)).unwrap();
        let base = t.base_balance as i128 + taker_delta.base_delta;
        let quote = t.quote_balance as i128 + taker_delta.quote_delta;
        assert!(base >= 0 && quote >= 0);
        assert_eq!(report.total_base_filled, 8);
        assert_eq!(report.fills.len(), 2);
        assert_eq!(report.fills[0].maker, pk(1)); // earliest seq first
        assert_eq!(report.fills[1].maker, pk(2));
        assert_eq!(report.total_quote_filled, 8 * 100);
        assert_eq!(deltas.entries.len(), 2);
        // pk(1) fully filled; pk(2) sells 3 of 4 (1 rests at the head of the bids).
        assert_eq!(base, 100 - 8);
        assert_eq!(quote, (50_000 + (8 * 100 - report.taker_fee_total)) as i128);
        let bids = price_level::levels(&book, OrderSide::Bid);
        assert_eq!(bids.len(), 2);
        assert_eq!(bids[0].price, 100);
        assert_eq!(bids[0].total_qty, 1);
        assert_eq!(bids[1].price, 90);
        assert_eq!(bids[1].total_qty, 9);
    }

    #[test]
    fn ask_rest_consumed_by_bid() {
        let mut book = OrderBookState::default();
        rest_order(&mut book, OrderSide::Ask, 110, 3, pk(2), pk(3), 0, 1).unwrap();
        rest_order(&mut book, OrderSide::Ask, 120, 7, pk(2), pk(3), 0, 2).unwrap();

        let mut m = market();
        let t = trader(100_000, 0);
        let (report, taker_delta, deltas) = execute(&mut book, &mut m, &t, &incoming(true, 120, 5)).unwrap();
        let base = t.base_balance as i128 + taker_delta.base_delta;
        let quote = t.quote_balance as i128 + taker_delta.quote_delta;
        assert!(base >= 0 && quote >= 0);
        assert_eq!(report.total_base_filled, 5);
        assert_eq!(report.fills[0].price, 110);
        assert_eq!(report.fills[1].price, 120);
        assert_eq!(report.total_quote_filled, 3 * 110 + 2 * 120);
        let _ = deltas;
        // one rest remains: 5 of the 7 at 120
        let lvls = price_level::levels(&book, OrderSide::Ask);
        assert_eq!(lvls.len(), 1);
        assert_eq!(lvls[0].price, 120);
        assert_eq!(lvls[0].total_qty, 5);
    }

    #[test]
    fn limit_leftover_rests_between_prices() {
        let mut book = OrderBookState::default();
        rest_order(&mut book, OrderSide::Ask, 110, 1, pk(2), pk(3), 0, 1).unwrap();
        rest_order(&mut book, OrderSide::Ask, 120, 1, pk(2), pk(3), 0, 2).unwrap();
        rest_order(&mut book, OrderSide::Ask, 130, 1, pk(2), pk(3), 0, 3).unwrap();

        let mut m = market();
        let t = trader(200_000, 0);
        // Bid 125: takes 110, 120; rests its own 125 leftover.
        let (report, taker_delta, _) = execute(&mut book, &mut m, &t, &incoming(true, 125, 3)).unwrap();
        let base = t.base_balance as i128 + taker_delta.base_delta;
        let quote = t.quote_balance as i128 + taker_delta.quote_delta;
        assert!(base >= 0 && quote >= 0);
        assert_eq!(report.total_base_filled, 2);
        assert_eq!(report.remaining_base, 1);
        // uncovered bid rests on the bid side at 125, ahead of the 90/100 bids.
        let asks = price_level::levels(&book, OrderSide::Ask);
        assert_eq!(asks.len(), 1);
        assert_eq!(asks[0].price, 130);
        let bids = price_level::levels(&book, OrderSide::Bid);
        assert_eq!(bids.len(), 1);
        assert_eq!(bids[0].price, 125);
        assert_eq!(bids[0].total_qty, 1);
    }

    #[test]
    fn market_order_sweeps_whole_side() {
        let mut book = OrderBookState::default();
        rest_order(&mut book, OrderSide::Ask, 100, 5, pk(2), pk(3), 0, 1).unwrap();
        rest_order(&mut book, OrderSide::Ask, 101, 5, pk(2), pk(3), 0, 2).unwrap();

        let mut m = market();
        let t = trader(1_000_000, 0);
        let incoming = Incoming {
            is_market: true,
            price: u64::MAX, // sentinel
            ..incoming(true, u64::MAX, 7)
        };
        let (report, taker_delta, deltas) = execute(&mut book, &mut m, &t, &incoming).unwrap();
        let base = t.base_balance as i128 + taker_delta.base_delta;
        let quote = t.quote_balance as i128 + taker_delta.quote_delta;
        assert!(base >= 0 && quote >= 0);
        assert_eq!(report.total_base_filled, 7);
        assert_eq!(report.fills.len(), 2);
        assert_eq!(report.remaining_base, 0);
        // no resting bid created from a market order
        assert_eq!(book.bid_head, NONE_IDX);
        let _ = deltas;
        // remaining ask rests
        let asks = price_level::levels(&book, OrderSide::Ask);
        assert_eq!(asks.len(), 1);
        assert_eq!(asks[0].price, 101);
        assert_eq!(asks[0].total_qty, 3);
    }

    #[test]
    fn cancel_only_removes_matching_order() {
        let mut book = OrderBookState::default();
        rest_order(&mut book, OrderSide::Bid, 100, 5, pk(1), pk(3), 0, 42).unwrap();
        rest_order(&mut book, OrderSide::Bid, 99, 5, pk(1), pk(3), 0, 43).unwrap();

        let cancelled = cancel_order(&mut book, OrderSide::Bid, &pk(1), 42).unwrap();
        assert_eq!(cancelled.price, 100);
        assert_eq!(cancelled.client_order_id, 42);

        let lvls = price_level::levels(&book, OrderSide::Bid);
        assert_eq!(lvls.len(), 1);
        assert_eq!(lvls[0].price, 99);

        assert!(matches!(
            cancel_order(&mut book, OrderSide::Bid, &pk(1), 42),
            Err(MagiCLOBError::OrderNotFound)
        ));
    }

    #[test]
    fn slot_recycling_reuses_freed_slots() {
        let mut book = OrderBookState::default();
        assert_eq!(rest_order(&mut book, OrderSide::Bid, 100, 5, pk(1), pk(3), 0, 1).unwrap(), 0);
        assert_eq!(rest_order(&mut book, OrderSide::Bid, 90, 5, pk(1), pk(3), 0, 2).unwrap(), 1);
        cancel_order(&mut book, OrderSide::Bid, &pk(1), 1).unwrap();
        // freed slot 0 must be reused before high-water mark grows
        assert_eq!(rest_order(&mut book, OrderSide::Bid, 80, 5, pk(1), pk(3), 0, 3).unwrap(), 0);
        assert_eq!(book.bid_count, 2);
    }

    #[test]
    fn insufficient_taker_balance_is_reported_for_settlement() {
        let mut book = OrderBookState::default();
        rest_order(&mut book, OrderSide::Ask, 100, 5, pk(2), pk(3), 0, 1).unwrap();
        let mut m = market();
        let t = trader(100, 0); // cannot afford 5*100=500
        let (_, taker_delta, _) = execute(&mut book, &mut m, &t, &incoming(true, 100, 5)).unwrap();
        assert!(t.quote_balance as i128 + taker_delta.quote_delta < 0);
    }

    #[test]
    fn allowed_self_cross_settles_to_net_fees() {
        // Own resting ask is the only maker; the aggressive buy self-crosses.
        // With SelfMatchingOption::Allowed the taker only owes the fees — it
        // must NOT be forced to pre-fund the full notional.
        let mut book = OrderBookState::default();
        rest_order(&mut book, OrderSide::Ask, 100, 5, pk(1), pk(3), 0, 1).unwrap();

        let mut m = market();
        m.current_taker_fee_bps = 200; // 2% so a real fee is owed on the cross
        let mut t = trader(50, 10); // 50 quote < 500 notional
        let (report, taker_delta, deltas) = execute(&mut book, &mut m, &t, &incoming(true, 100, 5)).unwrap();
        assert_eq!(report.total_base_filled, 5);
        assert_eq!(report.fills.len(), 1);
        assert_eq!(report.fills[0].maker, pk(1));
        assert!(report.self_trade);
        assert_eq!(deltas.entries.len(), 1);

        settle(&pk(9), &mut t, taker_delta, &deltas, &[]).unwrap();

        // 5 base bought and sold back; quote: 50 - 2%×500 (taker fee only).
        assert_eq!(t.base_balance, 10);
        assert_eq!(t.quote_balance, 40);
    }

    #[test]
    fn seed_history_style_self_cross_settles() {
        // Mirrors the local seed bot's SOL/USDC numbers: mid 95.00, tick 0.01
        // → per-lamport 95_000_000 raw quote, lot 1e8 raw base, buy 2 lots.
        let mut book = OrderBookState::default();
        rest_order(&mut book, OrderSide::Ask, 95_010_000, 3 * 100_000_000, pk(1), pk(3), 0, 1).unwrap();
        rest_order(&mut book, OrderSide::Ask, 95_030_000, 2 * 100_000_000, pk(1), pk(3), 0, 2).unwrap();

        let mut m = market();
        let mut t = trader(60_000_000_000, 150_000_000_000);
        let incoming = Incoming {
            is_market: true,
            price: u64::MAX,
            ..incoming(true, u64::MAX, 2 * 100_000_000)
        };
        let (report, taker_delta, deltas) = execute(&mut book, &mut m, &t, &incoming).unwrap();
        assert_eq!(report.total_base_filled, 200_000_000);
        assert_eq!(report.fills.len(), 1);
        assert!(report.self_trade);
        let e = deltas.entries[0];
        dbg!(e);
        settle(&pk(9), &mut t, taker_delta, &deltas, &[]).unwrap();
        assert_eq!(t.base_balance, 150_000_000_000);
        assert_eq!(t.quote_balance, 60_000_000_000);
    }

    #[test]
    fn capacity_fails_gracefully() {
        let mut book = OrderBookState::default();
        for i in 0..(MAX_ORDERS_PER_SIDE as u64) {
            rest_order(&mut book, OrderSide::Bid, 1 + i, 1, pk(1), pk(3), 0, i as u64).unwrap();
        }
        assert!(matches!(
            rest_order(&mut book, OrderSide::Bid, 1, 1, pk(2), pk(3), 0, 999),
            Err(MagiCLOBError::BookCapacityReached)
        ));
    }

    #[test]
    fn test_deposit_withdraw_spl() {
        let trader = TraderState {
            owner: pk(1),
            base_balance: 100,
            quote_balance: 200,
            status: TraderStatus::Active,
            bump: 255,
            deposited_base: 50,
            deposited_quote: 75,
            base_vault: Pubkey::default(),
            quote_vault: Pubkey::default(),
            staked_amount: 0,
            stake_epoch: 0,
            ..Default::default()
        };

        let deposited_base = trader.deposited_base.checked_add(25).unwrap();
        let deposited_quote = trader.deposited_quote.checked_add(50).unwrap();
        assert_eq!(deposited_base, 75);
        assert_eq!(deposited_quote, 125);

        let withdrawn_base = deposited_base.checked_sub(25).unwrap();
        let withdrawn_quote = deposited_quote.checked_sub(50).unwrap();
        assert_eq!(withdrawn_base, 50);
        assert_eq!(withdrawn_quote, 75);
    }
}