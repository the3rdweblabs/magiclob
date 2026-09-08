// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

//! The MagiCLOB matching engine - pure logic, no solana I/O.
//!
//! * `order_types`  - shared order/book primitives.
//! * `price_level`  - aggregation helpers for depth/top-of-book reporting.
//! * `matcher`      - the price-time priority matching engine (see `execute`).

pub mod matcher;
pub mod order_types;
pub mod price_level;

pub use matcher::*;
pub use order_types::*;