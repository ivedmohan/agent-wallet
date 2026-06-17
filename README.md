# x402 + Agent Wallet

**AI agents pay for APIs in USDC — including gas. No staking. No subsidies. No AVAX.**

Built on [SmoothSend](https://smoothsend.xyz) ERC-4337 paymaster + bundler infrastructure.

---

## The Problem With x402

Base's x402 protocol is elegant — but it makes **merchants pay gas in ETH** for every transaction.

```
1000 x402 transactions on Base:
Merchant revenue:  $500.00
Merchant gas cost: $20.00  ← merchant subsidizes
Merchant keeps:    $480.00 (96%)
```

**Agent Wallet flips this.** The agent pays everything in USDC — API fee AND gas — so the merchant keeps 100%.

```
1000 transactions with Agent Wallet:
Merchant revenue:  $500.00
Merchant gas cost: $0.00   ← agent pays in USDC
Merchant keeps:    $500.00 (100%)
```

---

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌────────────────┐
│             │     │              │     │              │     │                │
│  AI Agent   │ ──→ │  x402 API    │ ←── │  402 Payment  │ ──→ │  SmoothSend    │
│  Wallet     │     │  Server      │     │  Required     │     │  Bundler       │
│             │     │              │     │  $0.25 USDC   │     │  + Paymaster   │
│  $20 USDC   │     │              │     │              │     │                │
│  Balance    │     │              │     │              │     │  user-pays-    │
│             │     │              │     │              │     │  erc20 mode    │
└─────────────┘     └──────────────┘     └──────────────┘     └────────────────┘
       │                    │                                         │
       │                    │                                         │
       └────── retry ───────┘                                         │
       with X-Payment-Tx                                              │
       proof                                                          │
                                                                      │
                                         ┌────────────────────────────┘
                                         │
                                    ┌────▼────┐
                                    │  USDC   │
                                    │  Smart  │
                                    │ Account │
                                    │  ERC-   │
                                    │  4337   │
                                    └─────────┘
```

1. Agent sends `GET /weather?city=Tokyo`
2. Server responds `402 Payment Required` with `x-payment-price: 0.25`, `x-payment-recipient: 0x...`
3. `AgentWallet.payForService()` submits a UserOp via SmoothSend's bundler
4. Paymaster deducts **$0.25 USDC (API) + gas in USDC** from the smart account
5. Agent retries with `X-Payment-Tx: 0x...` → gets the data

**The agent never touches AVAX. The merchant never pays gas.**

---

## Quick Start

```bash
npm install @vedmohan/agent-wallet
```

```typescript
import { AgentWallet, X402Client } from '@vedmohan/agent-wallet';

// 1. Create a wallet
const wallet = await AgentWallet.create({
  smoothSendApiKey: 'sk_nogas_...',
  dailyLimit: '100',
  perTxLimit: '10',
  network: 'avalanche-fuji',  // or 'avalanche-mainnet'
});

console.log(`Smart Account: ${wallet.address}`);

// 2. Start making x402 calls — auto-pays when needed
const x402 = new X402Client({ wallet });

const weather = await x402.request('https://api.example.com/weather?city=Tokyo');
console.log(`🌤️  ${weather.data.temperature}°C, ${weather.data.condition}`);
// 💸 Auto-paid $0.28 USDC (API + gas)
```

---

## Real Transaction

After funding the smart account with Fuji USDC:

```
🔑 EOA:             0x6e5ce646fD3D59e8981E24273087636b8F0F1322
🏦 Smart Account:   0xB8b741911c1Fa06591D0EE04CC239891beb02419
💰 Balance:         $20.00 USDC

🌤️  Fetching weather... (auto-pay via x402)
⚡ API requires payment — $0.25 USDC
✍️  Submitting sponsored UserOp...
✅ Payment succeeded!
   TxHash: 0xa4ec7c0454a6f9972f6d09dea489c78b3dbbd972f63e3183646f6324329ef1db
   Total:  $0.28 USDC (API + gas)
   API:    $0.25 USDC
   Gas:    $0.03 USDC
🌤️  Tokyo: 25°C, sunny
```

[View on Snowtrace →](https://testnet.snowtrace.io/tx/0xa4ec7c0454a6f9972f6d09dea489c78b3dbbd972f63e3183646f6324329ef1db)

---

## API

### AgentWallet

```typescript
const wallet = await AgentWallet.create(config: AgentWalletConfig)
```

| Field | Required | Description |
|-------|----------|-------------|
| `smoothSendApiKey` | ✅ | From [dashboard.smoothsend.xyz](https://dashboard.smoothsend.xyz) |
| `network` | ✅ | `avalanche-fuji` or `avalanche-mainnet` |
| `dailyLimit` | ✅ | Max USDC spend per day |
| `perTxLimit` | ✅ | Max USDC per transaction |
| `privateKey` | ❌ | Reuse a wallet. Omit to generate random. |
| `allowedMerchants` | ❌ | Restrict which addresses can be paid |

**Methods:**
- `wallet.getBalance()` → USDC balance of the smart account
- `wallet.payForService(req)` → Pay a merchant, returns `{ txHash, totalCost, gasCost, apiCost }`
- `wallet.getBudgetStatus()` → `{ dailyLimit, spentToday, remaining, txCount }`
- `wallet.exportPrivateKey()` → Export the EOA private key

### X402Client

```typescript
const x402 = new X402Client({ wallet });
const result = await x402.request(url | axiosConfig);
const results = await x402.batch([url1, url2, ...]);
```

Returns `{ data, status, paid, payment? }` — `paid` is `true` if a 402 was triggered and resolved.

### McpClient

```typescript
const mcp = new McpClient();
const tx = await mcp.lookupTransaction('avalanche-fuji', '0x...');
const fees = await mcp.getTransactionFees('fuji');
```

---

## The Economics

| | Base x402 | Agent Wallet |
|---|---|---|
| Merchant receives | 96% of revenue | **100%** |
| Who pays gas | Merchant in ETH | **Agent in USDC** |
| Paymaster mode | — | `user-pays-erc20` |
| Token | USDC | **USDC** |
| AVAX needed? | No (Base) | **No** |
| Setup required | Deploy paymaster | **Zero — SmoothSend handles it** |

---

## Architecture

- **Smart Account**: ERC-4337 `SimpleAccount` (deployed by SmoothSend's factory)
- **Paymaster**: SmoothSend's `VerifyingPaymaster` — converts gas to USDC, deducts from smart account
- **Bundler**: SmoothSend's bundler — submits UserOps to the EntryPoint
- **SDK**: `AgentWallet` (wallet) + `X402Client` (HTTP) + `McpClient` (on-chain verification)

---

## Demo

Live demo at **[agent-wallet.vercel.app](https://agent-wallet.vercel.app)** — click "Run Demo" to watch a real x402 flow on Avalanche Fuji.

## License

MIT — © 2026 [Ved Mohan](https://github.com/vedmohan)
