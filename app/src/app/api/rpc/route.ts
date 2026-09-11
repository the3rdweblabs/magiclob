// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import { resolveNetworkConfig } from "@/config/networks";

export const dynamic = "force-dynamic";

/**
 * JSON-RPC proxy for `local`.
 *
 * `solana-test-validator` sends no CORS headers, so browsers cannot talk to
 * 127.0.0.1:8899 directly. The browser is pointed at `/api/rpc` (same-origin)
 * and this route relays to the real endpoint from the server side.
 */
export async function POST(req: Request) {
  const cfg = resolveNetworkConfig();
  const body = await req.text();
  try {
    const upstream = await fetch(cfg.rpcUrl, {
      method: "POST",
      headers: {
        "content-type":
          req.headers.get("content-type") ?? "application/json",
      },
      body,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: String(err) }, id: null },
      { status: 502 }
    );
  }
}

export async function GET() {
  return new Response("magicbook rpc proxy ok");
}