// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Site branding for the magiCLOB product site.
 *
 * magiCLOB is the open Central Limit Order Book (CLOB) engine; MagicBook is
 * the reference web interface that trades against it. Rename or re-point any
 * product by editing this single file.
 */
export const site = {
  /** The product this site presents. */
  name: "magiCLOB",
  /** The reference trading interface / live demo. */
  demo: {
    name: "MagicBook",
    url: "/magicbook",
    app: "/orderbook",
  },
  tagline: "Where Solana Liquidity Scales.",
  description:
    "A real central limit order book for Solana - zero-gas, MEV-resistant trading powered by MagicBlock Ephemeral Rollups.",
  /** External pointers for the build page. */
  links: {
    github: "https://github.com/the3rdweblabs/magiclob",
    sdk: "https://github.com/the3rdweblabs/magiclob/tree/main/sdk",
  },
  nav: [
    { label: "Build", href: "/build" },
    { label: "MagicBook", href: "/magicbook" },
    { label: "Open orderbook", href: "/orderbook", cta: true },
  ],
} as const;