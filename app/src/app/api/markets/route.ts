// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import { resolveNetworkConfig } from "@/config/networks";

export const dynamic = "force-dynamic";

/** Available pairs for the active network. */
export async function GET() {
  const cfg = resolveNetworkConfig();
  return Response.json({ pairs: cfg.pairs });
}