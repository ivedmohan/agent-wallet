# 🤖 x402 + Agent Wallet

**AI agents pay for APIs in USDC on Avalanche — including gas. No AVAX needed. No merchant subsidies.**

Built on [SmoothSend](https://smoothsend.xyz) ERC-4337 infrastructure (VerifyingPaymaster + bundler on Avalanche C-Chain).

---

## ✨ Live Demo

**[x402avax.vercel.app](https://x402avax.vercel.app/)** — try the x402 flow live:

1. Toggle **x402 OFF** → see the raw `402 Payment Required` error with price
2. Toggle **x402 ON** → wallet auto-pays in USDC and returns the data
3. Watch every step in the terminal: wallet creation → 402 → payment → data

Pick any city (Tokyo, London, Dubai, NYC, Singapore) — each request costs `$0.02 USDC` total ($0.01 API + $0.01 gas min floor).

---

## Why Agent Wallet over plain x402?

Base's x402 protocol makes **merchants pay gas in ETH**. Agent Wallet flips this — the agent (AI) pays everything in **USDC on Avalanche**, so the merchant keeps **100%** of revenue.

| | Plain x402 | Agent Wallet |
|---|---|---|
| Network | Base (ETH gas) | **Avalanche C-Chain** |
| Merchant receives | ~96% (gas deducted) | **100%** |
| Who pays gas | Merchant in ETH | **Agent in USDC** |
| Gas token | ETH | **USDC (via paymaster)** |
| Agent needs ETH? | Yes | **No — just USDC** |
| Setup | Deploy paymaster + KYC | **1 API key, 30 seconds** |
| Paymaster mode | — | `user-pays-erc20` |
| Smart Account | — | ERC-4337 `SimpleAccount` |

---

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌────────────────┐
│             │     │              │     │                │     │                │
│  AI Agent   │ ──→ │  x402 API    │ ←── │  402 Payment   │ ──→ │  SmoothSend    │
│  Wallet     │     │  Server      │     │  Required      │     │  Bundler       │
│             │     │              │     │  $0.01 USDC    │     │  + Paymaster   │
│  $20 USDC   │     │              │     │                │     │  (Avalanche)   │
│  Balance    │     │              │     │                │     │                │
└─────────────┘     └──────────────┘     └────────────────┘     └────────────────┘
       │                    │                     │                      │
       │                    │                     │   UserOp via         │
       │  retry with        │                     │   ERC-4337           │
       │  X-Payment-Tx      │                     │   EntryPoint v0.7    │
       └────────────────────┘                     │                      │
                                                  │  USDC deducted:      │
                                                  │  • $0.01 → merchant  │
                                                  │  • $0.01 → gas (min) │
                                                  └──────────────────────┘
```

### Flow

1. Agent sends `GET /weather?city=Tokyo`
2. Server responds **402 Payment Required** with:
   - `x-payment-price: 0.01`
   - `x-payment-recipient: 0x...`
   - `x-payment-token: USDC`
3. `X402Client` detects 402 → calls `wallet.payForService()`
4. Wallet submits a **UserOp** to SmoothSend's bundler (user-pays-erc20 mode)
5. Paymaster splits the cost:
   - **$0.01 USDC** → merchant (API fee)
   - **$0.01 USDC** → treasury (gas minimum floor)
6. Agent retries with `X-Payment-Tx: 0x...` → gets the data 🎉

**The agent never touches AVAX. The merchant never pays gas.**

---

## Quick Start

```bash
npm install @vedmohan/agent-wallet
```

```typescript
import { AgentWallet, X402Client } from '@vedmohan/agent-wallet';

// 1. Create a wallet (smart account is auto-deployed on first tx)
const wallet = await AgentWallet.create({
  smoothSendApiKey: 'sk_nogas_...',      // from dashboard.smoothsend.xyz
  dailyLimit: '100',                       // max $100 USDC/day
  perTxLimit: '10',                        // max $10 USDC/tx
  network: 'avalanche-fuji',               // or 'avalanche-mainnet'
});

console.log(`Smart Account: ${wallet.address}`);
console.log(`Balance: $${await wallet.getBalance()} USDC`);

// 2. Start making x402 calls — auto-pays when a 402 is received
const x402 = new X402Client({ wallet });

const weather = await x402.request(
  'https://api.example.com/weather?city=Tokyo'
);

console.log(`🌤️  ${weather.data.temperature}°C, ${weather.data.condition}`);
// 💸 Auto-paid $0.02 USDC — all in USDC
//    API: $0.01  ·  Gas: $0.01 (min. floor)
```

---

## Real Transaction on Avalanche Fuji

```
🔑 EOA Address:     0x6e5ce646fD3D59e8981E24273087636b8F0F1322
🏦 Smart Account:   0xB8b741911c1Fa06591D0EE04CC239891beb02419
💳 USDC Token:      0x5425890298aed601595a70AB815c96711a31Bc65 (Fuji USDC)

🌐 GET /api/merchant?type=weather&city=Tokyo
⚡ 402 Payment Required — $0.01 USDC
💸 Processing payment via SmoothSend...
✅ Payment succeeded!
   TxHash: 0x7bdc0145ea5e1518cc70ea8ceb89c292bdb75c4d578c8a92f7445865a953c392
💰 Total:  $0.02 USDC  │  API: $0.01  │  Gas: $0.01 (min. floor)
🌤️  Tokyo: 25°C, sunny
```

[View on Snowtrace →](https://testnet.snowtrace.io/tx/0x7bdc0145ea5e1518cc70ea8ceb89c292bdb75c4d578c8a92f7445865a953c392)

---

## API Reference

### AgentWallet

```typescript
const wallet = await AgentWallet.create(config: AgentWalletConfig)
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `smoothSendApiKey` | ✅ | — | From [dashboard.smoothsend.xyz](https://dashboard.smoothsend.xyz) |
| `network` | ✅ | — | `avalanche-fuji` or `avalanche-mainnet` |
| `dailyLimit` | ✅ | — | Max USDC spend per day (e.g. `'100'`) |
| `perTxLimit` | ✅ | — | Max USDC per transaction (e.g. `'10'`) |
| `privateKey` | ❌ | Random EOA | Reuse a wallet across restarts. Export via `wallet.exportPrivateKey()` |
| `rpcUrl` | ❌ | Default RPC | Custom Avalanche RPC endpoint |
| `allowedMerchants` | ❌ | All allowed | Restrict which addresses can be paid |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `wallet.address` | `string` | Smart account address (ERC-4337) |
| `wallet.eoaAddress` | `string` | EOA address (owner of smart account) |
| `getBalance()` | `string` | USDC balance of smart account |
| `payForService(req)` | `PaymentResult` | Pay a merchant in USDC (auto-approves paymaster if needed) |
| `getBudgetStatus()` | `BudgetStatus` | `{ dailyLimit, spentToday, remaining, txCount }` |
| `exportPrivateKey()` | `string` | Export EOA private key (for persistence) |

**`payForService` auto-handles:**
- ✅ Paymaster approval (first call approves 1000 USDC, subsequent calls skip)
- ✅ Gas cost deduction in USDC (paymaster minimum fee floor applied)
- ✅ Budget checks (daily & per-tx limits)
- ✅ Balance checks (insufficient balance → clear error with deposit address)

### X402Client

```typescript
const x402 = new X402Client({ wallet });

// Single request
const result = await x402.request(url | AxiosRequestConfig);

// Batch requests
const results = await x402.batch([url1, url2, ...]);
```

Returns `{ data, status, paid, payment? }`:
- `paid: false` → no payment needed (200/redirect)
- `paid: true` → 402 was paid, `payment` contains `{ txHash, totalCost, gasCost, apiCost }`

### McpClient

```typescript
const mcp = new McpClient();

// Look up a real transaction
const tx = await mcp.lookupTransaction(txHash, 'fuji');

// Get current fee estimates
const fees = await mcp.getTransactionFees('fuji');
```

---

## Architecture

| Component | Description |
|-----------|-------------|
| **Smart Account** | ERC-4337 `SimpleAccount` — deployed by SmoothSend's factory on first UserOp |
| **Paymaster** | `VerifyingPaymaster` (Coinbase fork on Avalanche) — converts gas to USDC via `user-pays-erc20` mode |
| **Bundler** | SmoothSend's bundler — submits UserOps to EntryPoint v0.7 |
| **EntryPoint** | Canonical `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| **Network** | Avalanche Fuji (testnet) / Avalanche C-Chain (mainnet) |
| **Gas Token** | AVAX (paymaster covers it, reimbursed in USDC from smart account) |
| **SDK** | `AgentWallet` (wallet mgmt) + `X402Client` (HTTP + auto-pay) + `McpClient` (on-chain verification) |

### Smart Account Address Prediction

The smart account address is deterministic — computed from `(factory, owner, salt=0)`. Send USDC to this address before making x402 calls.

You can get it by creating a wallet (even without a funded private key, it'll generate one):

```typescript
const wallet = await AgentWallet.create({
  smoothSendApiKey: 'sk_nogas_...',
  dailyLimit: '100',
  perTxLimit: '10',
  network: 'avalanche-fuji',
});
console.log(wallet.address); // → send USDC here
```

---

## Demo Site

The demo site at **[agent-wallet.vercel.app](https://agent-wallet.vercel.app)** is a Next.js app that:

- **x402 OFF**: Makes a raw API request → shows the 402 Payment Required error
- **x402 ON**: Runs the full auto-pay flow: wallet create → balance check → 402 → payment → data
- **City selector**: 5 cities with live weather data
- **Terminal log**: Step-by-step streaming output
- **Cost breakdown**: API fee + gas cost + Snowtrace link

### Running locally

```bash
cd agent-wallet/demo-site
cp .env.example .env   # add your SmoothSend API key + funded EOA private key
npm install
npm run dev            # localhost:3000
```

---

## Development

```bash
git clone https://github.com/vedmohan/agent-wallet.git
cd agent-wallet

npm install
npm run build

# Run the e2e test
cp .env.example .env   # add your keys
npm run test:e2e
```

---

## License

MIT — © 2026 [Ved Mohan](https://github.com/vedmohan)
