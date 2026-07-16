# 🤖 Private Agent Wallet — gasless x402 + ERC-8004

**AI agents pay for APIs in USDC on Avalanche — including gas — while spend details stay masked in the product UX. No AVAX needed. Plus on-chain agent identity and reputation via ERC-8004.**

Built on [SmoothSend](https://smoothsend.xyz) ERC-4337 infrastructure (VerifyingPaymaster + bundler on Avalanche C-Chain).

---

## ✨ Live Demo

**[x402avax.vercel.app](https://x402avax.vercel.app/)** — three tabs:

| Tab | What it does |
|-----|-------------|
| **Live Demo** | Toggle x402 OFF → see raw `402 Payment Required`. Toggle ON → auto-pays in USDC, get weather data. Private spend mode masks cost details until you reveal them. City picker (Tokyo, London, Dubai, NYC, Singapore). |
| **Marketplace** | ERC-8004 agent registry. Register your agent, browse agents by reputation score, hire via x402 payment + on-chain feedback |
| **Quick Start** | Copy-paste code snippets |

### Pivot Summary

This hackathon version focuses on a single, easy-to-demo story:

- gasless agent payments on Avalanche
- private spend presentation in the UI
- ERC-8004 identity and reputation as the trust layer

The working execution layer stays the same. The product narrative shifts from a general agent wallet to a `Private Agent Wallet`.

---

## What's New in v2.0.0 — ERC-8004 Agent Registry

This release adds **on-chain agent identity and reputation** via [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004): the Trustless Agents standard.

Two contracts deployed on **Avalanche Fuji**:

| Contract | Address | Role |
|----------|---------|------|
| **IdentityRegistry** | `0x3F5Ee79771C2628D3941Bc015d306C194DA2E425` | ERC-721 agent identities with EIP-712 wallet verification |
| **ReputationRegistry** | `0x351487d9E592B0D6682b0027a2eA099ab2652B10` | On-chain feedback scores with proof-of-payment |

Source: `agent-wallet/contracts/contracts/`

```typescript
// New in v2.0.0 — ERC-8004 identity + reputation
const wallet = await AgentWallet.create({ ... });

// Register an agent identity (mints an ERC-721, gas sponsored)
const agentId = await wallet.registerIdentity(
  'Weather Bot',
  'Gets weather data via x402 on Avalanche'
);
// → Agent ID: 1 — on-chain identity created

// Get reputation score for any agent
const rep = await wallet.getReputation(agentId);
// → { count: 5, summaryValue: 42500, valueDecimals: 2, score: 85 }

// Submit feedback after a transaction
const feedbackTx = await wallet.submitFeedback({
  agentId: 1,
  value: 85,
  tag1: 'x402',
  feedbackURI: 'data:...,{"proofOfPayment":{"txHash":"0x..."}}',
});

// Get full marketplace listing
const listing = await wallet.getAgentListing(agentId);
// → { identity: { agentId, owner, agentWallet }, reputation: { count, score } }
```

### ERC-8004 Flow

```
AgentWallet.create()
  → registerIdentity(name, desc)    // Mints ERC-721 on IdentityRegistry
  → x402.request(url)               // Pays API in USDC
  → submitFeedback(agentId, score)  // Posts feedback to ReputationRegistry
  → getReputation(agentId)          // Reads on-chain reputation score
```

The IdentityRegistry uses **EIP-712 signatures** to verify the agent's payment wallet. The ReputationRegistry stores feedback as `(value, valueDecimals, tag1, tag2)` with optional `proofOfPayment` URIs. Both are **per-chain singletons** — one shared registry that all agents register to, building a networked reputation layer.

---

## Monorepo Structure

```
agent-wallet/
├── src/                     # SDK source (AgentWallet, X402Client, types)
├── contracts/               # ERC-8004 Solidity contracts
│   ├── contracts/
│   │   ├── IdentityRegistry.sol    # ERC-721 agent identity
│   │   └── ReputationRegistry.sol  # On-chain feedback
│   ├── scripts/deploy.ts           # Fuji deploy script
│   ├── hardhat.config.ts
│   └── DEPLOYED.md                 # Contract addresses
├── demo-site/               # Next.js demo app (Vercel)
│   └── app/
│       ├── page.tsx                 # Main UI (3 tabs)
│       └── api/
│           ├── demo/route.ts        # x402 flow + agent registration
│           ├── marketplace/route.ts # Agent listing API
│           └── merchant/route.ts    # Merchant endpoint (402)
├── dist/                    # Built SDK
└── package.json             # @vedmohan/agent-wallet
```

---

## Why Agent Wallet?

Base's x402 protocol makes **merchants pay gas in ETH**. Agent Wallet flips this — the agent pays everything in **USDC on Avalanche**:

| | Plain x402 | Agent Wallet |
|---|---|---|
| Network | Base (ETH gas) | **Avalanche C-Chain** |
| Merchant receives | ~96% | **100%** |
| Who pays gas | Merchant in ETH | **Agent in USDC** |
| Gas token | ETH | **USDC** |
| Agent needs ETH? | Yes | **No — just USDC** |
| Setup | Deploy paymaster + KYC | **1 API key, 30s** |
| Identity | None | **ERC-8004 on-chain** |
| Reputation | None | **On-chain feedback** |

---

## Quick Start

```bash
npm install @vedmohan/agent-wallet
```

```typescript
import { AgentWallet, X402Client } from '@vedmohan/agent-wallet';

// Create wallet (smart account auto-deployed on first tx)
const wallet = await AgentWallet.create({
  smoothSendApiKey: 'sk_nogas_...',      // dashboard.smoothsend.xyz
  dailyLimit: '100',
  perTxLimit: '10',
  network: 'avalanche-fuji',
});

console.log(`Smart Account: ${wallet.address}`);
console.log(`Balance: $${await wallet.getBalance()} USDC`);

// Optional: register an ERC-8004 identity
const agentId = await wallet.registerIdentity('My Bot', 'AI agent demo');
console.log(`Registered as Agent #${agentId}`);

// x402 calls — auto-pays when 402 is received
const x402 = new X402Client({ wallet });

const weather = await x402.request(
  'https://api.example.com/weather?city=Tokyo'
);

console.log(`🌤️  ${weather.data.temperature}°C, ${weather.data.condition}`);
// 💸 Auto-paid $0.02 USDC — all in USDC
```

---

## API Reference

### AgentWallet

```typescript
const wallet = await AgentWallet.create(config)
```

| Config Field | Required | Default | Description |
|---|---|---|---|
| `smoothSendApiKey` | ✅ | — | From [dashboard.smoothsend.xyz](https://dashboard.smoothsend.xyz) |
| `network` | ✅ | — | `avalanche-fuji` or `avalanche-mainnet` |
| `dailyLimit` | ✅ | — | Max USDC/day (e.g. `'100'`) |
| `perTxLimit` | ✅ | — | Max USDC/tx (e.g. `'10'`) |
| `privateKey` | ❌ | Random EOA | Reuse wallet across restarts |
| `identityRegistryAddress` | ❌ | Fuji deployment | Custom IdentityRegistry address |
| `reputationRegistryAddress` | ❌ | Fuji deployment | Custom ReputationRegistry address |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `wallet.address` | `string` | Smart account address (ERC-4337) |
| `wallet.eoaAddress` | `string` | EOA owner address |
| `wallet.agentId` | `number \| null` | ERC-8004 agent ID (after `registerIdentity`) |
| `getBalance()` | `string` | USDC balance |
| `payForService(req)` | `PaymentResult` | Pay merchant in USDC (auto-approves paymaster) |
| `getBudgetStatus()` | `BudgetStatus` | Daily + per-tx budget info |
| `exportPrivateKey()` | `string` | Export EOA private key |
| `registerIdentity(name, desc)` | `number` | **v2.0** Mint ERC-8004 identity, returns agentId |
| `getReputation(agentId)` | `AgentReputation` | **v2.0** Read on-chain reputation score (0-100) |
| `submitFeedback(input)` | `string` | **v2.0** Submit feedback for an agent (tx hash) |
| `getAgentListing(agentId)` | `object` | **v2.0** Full identity + reputation listing |

### X402Client

```typescript
const x402 = new X402Client({ wallet });

const result = await x402.request(url | AxiosRequestConfig);
// → { data, status, paid, payment? }

const results = await x402.batch([url1, url2, ...]);
```

- `paid: false` → no payment needed
- `paid: true` → 402 was paid, `payment: { txHash, totalCost, gasCost, apiCost }`

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Agent Wallet SDK                  │
├─────────────┬──────────────┬────────────────────────┤
│ AgentWallet │ X402Client   │ McpClient              │
│ (wallet)    │ (auto-pay)   │ (tx lookup)            │
├─────────────┴──────┬───────┴────────────────────────┤
│                    │                                │
│     SmoothSend Bundler (ERC-4337)                   │
│     VerifyingPaymaster (user-pays-erc20)            │
│     EntryPoint v0.7                                 │
├─────────────────────────────────────────────────────┤
│ IdentityRegistry (ERC-8004)    ReputationRegistry   │
│ • register(name, desc)         • giveFeedback()     │
│ • setAgentWallet(EIP-712)      • getSummary()       │
│ • getAgentWallet()             • revokeFeedback()   │
└─────────────────────────────────────────────────────┘
```

---

## Development

### Running locally

```bash
# Terminal 1: build SDK in watch mode
cd agent-wallet
npm run dev

# Terminal 2: demo site with local SDK
cd agent-wallet/demo-site
npm run dev:local           # uses local build (no npm publish needed)
# or: npm run dev            # uses published npm package
```

### Deploying contracts

```bash
cd agent-wallet/contracts
cp .env.example .env        # add DEPLOYER_PRIVATE_KEY
npm run deploy:fuji
```

---

## License

MIT — © 2026 [Ved Mohan](https://github.com/vedmohan)
