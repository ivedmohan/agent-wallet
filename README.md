# Agent Wallet — Autonomous x402 Payments for AI Agents

AI agents pay for APIs in USDC — **including gas**. No AVAX needed. No merchant subsidies.

Built on [SmoothSend](https://smoothsend.xyz) ERC-4337 paymaster infrastructure.

## Why

Base's x402 requires merchants to subsidize gas in ETH. At 1000 transactions, that's $20+ in gas costs the merchant eats.

**Agent Wallet flips this.** The agent pays everything in USDC:
- API call: $0.50 USDC → merchant
- Gas: ~$0.02 USDC → paymaster treasury
- Merchant receives **100%** of revenue (vs 96% on Base)

## How It Works

```
Agent SDK                              API Server
   │                                        │
   ├── GET /weather?city=Tokyo ──────────→  │
   │←── 402 Payment Required ←────────────  │
   │    x-payment-price: 0.25               │
   │    x-payment-recipient: 0x...          │
   │                                        │
   ├── AgentWallet.payForService()          │
   │    → $0.25 USDC + gas via SmoothSend   │
   │    → No AVAX needed                    │
   │                                        │
   ├── GET /weather?city=Tokyo ──────────→  │
   │    X-Payment-Tx: 0x...                 │
   │←── 200 { temp: 25, ... } ←──────────  │
```

## Quick Start

```bash
npm install
cp .env.example .env  # Add your SmoothSend API key
```

**Terminal 1 — Start the x402 demo API:**
```bash
npm run start:demoserver
```

**Terminal 2 — Run the e2e test:**
```bash
npm run test:e2e
```

## Real Transactions on Avalanche Fuji

After funding the smart account with Fuji USDC, the agent autonomously:

```
💰 Balance: $20.00 USDC
🌤️  Fetching weather... (auto-pay via x402)
⚡ API requires payment — $0.25 USDC
✍️  Submitting sponsored UserOp...
✅ Payment succeeded! TxHash: 0xa4ec7c...
   Total: $0.28 USDC (API + gas, all in USDC)
🌤️  Tokyo: 25°C, sunny
```

## API

```typescript
import { AgentWallet, X402Client } from 'agent-wallet';

const wallet = await AgentWallet.create({
  smoothSendApiKey: 'sk_nogas_...',
  dailyLimit: '100',
  perTxLimit: '10',
  network: 'avalanche-fuji',
});

// Wallet automatically pays x402 fees
const x402 = new X402Client({ wallet });
const weather = await x402.request('https://api.example.com/weather?city=Tokyo');
```

## How Gas Works in USDC

SmoothSend's `user-pays-erc20` paymaster mode:
1. Bundler estimates gas cost in AVAX
2. Paymaster converts to USDC at real-time exchange rate
3. USDC deducted from smart account for gas
4. Agent sees one combined cost: API + gas in USDC

No AVAX required at any point.

## Built With

- [SmoothSend](https://smoothsend.xyz) — ERC-4337 paymaster + bundler infrastructure
- [Avalanche C-Chain](https://avax.network) — Fast finality, low fees
- [Avalanche MCP](https://build.avax.network/api/mcp) — On-chain verification

## License
MIT
