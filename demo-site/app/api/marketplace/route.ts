import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { avalancheFuji } from 'viem/chains';

export const runtime = 'nodejs';

// ── Contract Addresses ─────────────────────────────────────────
const IDENTITY_REGISTRY = '0x3F5Ee79771C2628D3941Bc015d306C194DA2E425' as `0x${string}`;
const REPUTATION_REGISTRY = '0x351487d9E592B0D6682b0027a2eA099ab2652B10' as `0x${string}`;
const RPC_URL = 'https://api.avax-test.network/ext/bc/C/rpc';

// ── Minimal ABIs ───────────────────────────────────────────────
const IDENTITY_ABI = [
  { name: 'ownerOf', type: 'function', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { name: 'getAgentWallet', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { name: 'tokenURI', type: 'function', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
] as const;

const REPUTATION_ABI = [
  { name: 'getSummary', type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'clientAddresses', type: 'address[]' }, { name: 'tag1', type: 'string' }, { name: 'tag2', type: 'string' }],
    outputs: [{ name: 'count', type: 'uint64' }, { name: 'summaryValue', type: 'int128' }, { name: 'summaryValueDecimals', type: 'uint8' }],
    stateMutability: 'view' },
  { name: 'getActiveFeedbackCount', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ name: '', type: 'uint64' }], stateMutability: 'view' },
] as const;

const client = createPublicClient({ chain: avalancheFuji, transport: http(RPC_URL) });

// ── Known agents ────────────────────────────────────────────────
const KNOWN_AGENTS = [1];

/**
 * GET /api/marketplace
 * Returns list of agents with reputation data.
 * GET /api/marketplace?id=1
 * Returns single agent detail.
 *
 * POST /api/marketpace
 * Body: { action: "register", name, description } — registers via demo route (not here)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const singleId = searchParams.get('id');

  try {
    const agentIds = singleId ? [parseInt(singleId)] : KNOWN_AGENTS;
    const agents = [];

    for (const agentId of agentIds) {
      if (isNaN(agentId)) continue;

      try {
        const owner = await client.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: 'ownerOf', args: [BigInt(agentId)] }) as `0x${string}`;
        const agentWallet = await client.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: 'getAgentWallet', args: [BigInt(agentId)] }) as `0x${string}`;

        let name = `Agent #${agentId}`;
        try {
          const uri = await client.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: 'tokenURI', args: [BigInt(agentId)] }) as string;
          if (uri.startsWith('data:')) {
            const json = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString());
            name = json.name || name;
          }
        } catch { /* use default name */ }

        let repScore = 0, repCount = 0;
        try {
          const summary = await client.readContract({
            address: REPUTATION_REGISTRY, abi: REPUTATION_ABI,
            functionName: 'getSummary',
            args: [BigInt(agentId), [owner as `0x${string}`], '', ''],
          }) as [bigint, bigint, number];
          repCount = Number(summary[0]);
          repScore = repCount > 0 ? Math.min(100, Math.round(Number(summary[1]) / 10 ** Number(summary[2]))) : 0;
        } catch { /* no reputation yet */ }

        agents.push({ agentId, name, owner, agentWallet, reputation: { count: repCount, score: repScore } });
      } catch { continue; }
    }

    return NextResponse.json({ success: true, agents });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}

// POST handler for registration — delegates to the demo route which has the wallet
// The marketplace tab in the UI calls /api/demo for registration
// This route is read-only (public RPC queries)
export async function POST(request: NextRequest) {
  return NextResponse.json({ success: false, error: 'Use GET for queries, POST /api/demo for registration' }, { status: 400 });
}
