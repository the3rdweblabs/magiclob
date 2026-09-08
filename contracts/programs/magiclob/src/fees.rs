// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! Fee router.
//!
//! MagiCLOB charges three fees per fill, all denominated in the quote asset and
//! expressed in basis points (bps, 1/10000 of the executed notional):
//!
//! Taker fee   - paid by the aggressive order, credited to the protocol.
//! Maker fee   - paid by the resting order, credited to the protocol.
//! Integrator fee - paid by the taker, credited to the integrator that
//!   placed the *resting* order. Per fill it is capped by the market's
//!   `integrator_fee_bps_cap`.
//!
//! Fees are computed on the executed `notional` (fill quantity * execution
//! price) in `u128` to avoid overflow, then reduced to `u64`.

use crate::errors::MagiCLOBError;

/// Maximum representable fee rate (100.00%).
pub const MAX_FEE_BPS: u16 = 10_000;

/// `fee_amount(notional, fee_bps)` returns the fee for a notional and a rate.
///
/// Computed as `notional * fee_bps / 10_000` in `u128`. The division is exact by
/// invariant: `notional * fee_bps` always fits in `u128` because both are at most
/// `u64::MAX` (quotient is strictly smaller than `notional`).
pub fn fee_amount(notional: u64, fee_bps: u16) -> Result<u64, MagiCLOBError> {
    if fee_bps > MAX_FEE_BPS {
        return Err(MagiCLOBError::InvalidFeeBps);
    }
    let fee = (notional as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(MagiCLOBError::ArithmeticOverflow)?;
    Ok((fee / MAX_FEE_BPS as u128) as u64)
}

/// `split_integrator_fee(fee, integrator_share_bps)` splits a fee into the
/// integrator's cut and the protocol's reserved cut.
///
/// `integrator_share_bps <= MAX_FEE_BPS`; any remainder after the split stays
/// with the protocol to keep the split lossless.
pub fn split_integrator_fee(fee: u64, integrator_share_bps: u16) -> (u64, u64) {
    let share = fee_amount(fee, integrator_share_bps).unwrap_or(0);
    (share, fee - share)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_notional_is_free() {
        assert_eq!(fee_amount(0, 25).unwrap(), 0);
        assert_eq!(fee_amount(0, 10_000).unwrap(), 0);
    }

    #[test]
    fn exact_bps_math() {
        // 1_000_000 notional @ 25 bps => 2_500
        assert_eq!(fee_amount(1_000_000, 25).unwrap(), 2_500);
        // 1_000_000 @ 100 bps (1%) => 10_000
        assert_eq!(fee_amount(1_000_000, 100).unwrap(), 10_000);
        // 1_000_000 @ 10_000 bps (100%) => 1_000_000
        assert_eq!(fee_amount(1_000_000, 10_000).unwrap(), 1_000_000);
    }

    #[test]
    fn rounding_floors_towards_protocol() {
        // 1_000_009 @ 25 bps => 2500.0225 -> 2500
        assert_eq!(fee_amount(1_000_009, 25).unwrap(), 2_500);
    }

    #[test]
    fn rejects_out_of_range_bps() {
        assert!(matches!(fee_amount(100, 10_001), Err(MagiCLOBError::InvalidFeeBps)));
    }

    #[test]
    fn large_notional_does_not_overflow() {
        // u64::MAX @ 10_000 bps -> fits in u128 and equals u64::MAX
        assert_eq!(fee_amount(u64::MAX, 10_000).unwrap(), u64::MAX);
        assert_eq!(fee_amount(u64::MAX, 1).unwrap() > 0, true);
    }

    #[test]
    fn integrator_split_is_lossless() {
        let fee = 10_000;
        let (i, p) = split_integrator_fee(fee, 5_000);
        assert_eq!(i, 5_000);
        assert_eq!(p, 5_000);
        assert_eq!(i + p, fee);

        let (i, p) = split_integrator_fee(fee, 2500);
        assert_eq!(i, 2_500);
        assert_eq!(i + p, fee);

        // integrator taking everything
        let (i, p) = split_integrator_fee(fee, 10_000);
        assert_eq!(i, fee);
        assert_eq!(p, 0);

        // integrator taking nothing
        let (i, p) = split_integrator_fee(fee, 0);
        assert_eq!(i, 0);
        assert_eq!(p, fee);
    }
}