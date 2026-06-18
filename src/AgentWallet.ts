import { Wallet, type HDNodeWallet } from 'ethers';
import {
  createPublicClient, createWalletClient, http,
  encodeFunctionData, parseUnits, type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji, avalanche } from 'viem/chains';
import {
  createSmoothSendAvaxClient, fetchAvaxAaPublicDefaults,
  predictSimpleAccountAddress,
} from '@smoothsend/sdk/avax';
import type { SmoothSendAvaxClient } from '@smoothsend/sdk/avax';
import { McpClient } from './McpClient.js';
import type {
  AgentWalletConfig, PaymentRequest, PaymentResult, BudgetStatus,
  AgentIdentity, AgentReputation, AgentListing, FeedbackInput,
} from './types.js';

const ERC20_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
] as const;

// ── ERC-8004 Fuji Addresses ───────────────────────────────────
const IDENTITY_REGISTRY_FUJI = '0x3F5Ee79771C2628D3941Bc015d306C194DA2E425' as Address;
const REPUTATION_REGISTRY_FUJI = '0x351487d9E592B0D6682b0027a2eA099ab2652B10' as Address;

// ── ERC-8004 Minimal ABIs ─────────────────────────────────────
const IDENTITY_REGISTRY_ABI = [
  { name: 'register', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }] },
  { name: 'getAgentWallet', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }] },
  { name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }] },
] as const;

const REPUTATION_REGISTRY_ABI = [
  { name: 'giveFeedback', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'value', type: 'int128' },
      { name: 'valueDecimals', type: 'uint8' },
      { name: 'tag1', type: 'string' },
      { name: 'tag2', type: 'string' },
      { name: 'endpoint', type: 'string' },
      { name: 'feedbackURI', type: 'string' },
      { name: 'feedbackHash', type: 'bytes32' },
    ],
    outputs: [] },
  { name: 'getSummary', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddresses', type: 'address[]' },
      { name: 'tag1', type: 'string' },
      { name: 'tag2', type: 'string' },
    ],
    outputs: [
      { name: 'count', type: 'uint64' },
      { name: 'summaryValue', type: 'int128' },
      { name: 'summaryValueDecimals', type: 'uint8' },
    ] },
] as const;

const NETWORK_CONFIG = {
  'avalanche-fuji': {
    chain: avalancheFuji,
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    usdcAddress: '0x5425890298aed601595a70AB815c96711a31Bc65' as Address,
    usdcDecimals: 6,
    networkLabel: 'testnet' as const,
    identityRegistry: IDENTITY_REGISTRY_FUJI,
    reputationRegistry: REPUTATION_REGISTRY_FUJI,
  },
  'avalanche-mainnet': {
    chain: avalanche,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    usdcAddress: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' as Address,
    usdcDecimals: 6,
    networkLabel: 'mainnet' as const,
    identityRegistry: undefined as Address | undefined,
    reputationRegistry: undefined as Address | undefined,
  },
} as const;

export class AgentWallet {
  private wallet: Wallet | HDNodeWallet;
  private smoothsend: SmoothSendAvaxClient;
  private mcp: McpClient;
  private config: AgentWalletConfig;
  private smartAccountAddress: Address;
  private usdcAddress: Address;
  private usdcDecimals: number;
  private paymasterAddress: Address;
  private rpcUrl: string;
  private dailySpent: number = 0;
  private txCountToday: number = 0;
  private lastResetDate: Date = new Date();
  private _agentId: number | null = null;
  private _identityRegistryAddress: Address;
  private _reputationRegistryAddress: Address;

  private constructor(
    wallet: Wallet | HDNodeWallet, smoothsend: SmoothSendAvaxClient,
    config: AgentWalletConfig, smartAccountAddress: Address,
    usdcAddress: Address, usdcDecimals: number,
    paymasterAddress: Address, rpcUrl: string,
    identityRegistryAddress: Address, reputationRegistryAddress: Address,
  ) {
    this.wallet = wallet; this.smoothsend = smoothsend;
    this.mcp = new McpClient(); this.config = config;
    this.smartAccountAddress = smartAccountAddress;
    this.usdcAddress = usdcAddress; this.usdcDecimals = usdcDecimals;
    this.paymasterAddress = paymasterAddress;
    this.rpcUrl = rpcUrl;
    this._identityRegistryAddress = identityRegistryAddress;
    this._reputationRegistryAddress = reputationRegistryAddress;
  }

  get agentId(): number | null { return this._agentId; }

  /** Validate that a string looks like a real EOA private key (0x + 64 hex chars). */
  private static isValidPrivateKey(key: string): boolean {
    return /^0x[0-9a-fA-F]{64}$/.test(key);
  }

  static async create(config: AgentWalletConfig): Promise<AgentWallet> {
    let wallet: Wallet | HDNodeWallet;
    if (config.privateKey && AgentWallet.isValidPrivateKey(config.privateKey)) {
      wallet = new Wallet(config.privateKey);
    } else {
      if (config.privateKey) {
        console.warn('⚠️  Invalid PRIVATE_KEY format in .env (expected 0x + 64 hex chars). Generating random wallet — balance will be $0.');
      }
      wallet = Wallet.createRandom();
    }
    console.log(`🔑 EOA Address:     ${wallet.address}`);
    const network = NETWORK_CONFIG[config.network];
    const rpcUrl = config.rpcUrl ?? network.rpcUrl;
    const publicClient = createPublicClient({ chain: network.chain, transport: http(rpcUrl) });
    const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: network.chain, transport: http(rpcUrl) });
    const smoothsend = createSmoothSendAvaxClient({
      apiKey: config.smoothSendApiKey, network: network.networkLabel,
      publicClient, walletClient, ownerAddress: wallet.address as Address,
    });
    const aaDefaults = await fetchAvaxAaPublicDefaults();
    const factory = (network.networkLabel === 'mainnet'
      ? aaDefaults.simpleAccountFactoryMainnet : aaDefaults.simpleAccountFactoryFuji) ?? undefined;
    if (!factory) throw new Error('[AgentWallet] Could not determine SimpleAccountFactory address.');
    const smartAccountAddress = await predictSimpleAccountAddress({
      publicClient, factory, owner: wallet.address as Address, salt: 0n,
    });
    const paymasterAddress = (network.networkLabel === 'mainnet'
      ? aaDefaults.paymasterMainnet : aaDefaults.paymasterFuji) ?? undefined;
    if (!paymasterAddress) throw new Error('[AgentWallet] Could not determine VerifyingPaymaster address.');
    console.log(`🏦 Smart Account:   ${smartAccountAddress}`);
    console.log(`💳 USDC Token:      ${network.usdcAddress}`);
    console.log(`⛽ Paymaster:       ${paymasterAddress}`);

    // Resolve ERC-8004 registry addresses
    const identityRegistryAddress = config.identityRegistryAddress
      ? (config.identityRegistryAddress as Address)
      : (network.identityRegistry ?? IDENTITY_REGISTRY_FUJI);
    const reputationRegistryAddress = config.reputationRegistryAddress
      ? (config.reputationRegistryAddress as Address)
      : (network.reputationRegistry ?? REPUTATION_REGISTRY_FUJI);

    const agent = new AgentWallet(
      wallet, smoothsend, config, smartAccountAddress,
      network.usdcAddress, network.usdcDecimals,
      paymasterAddress, rpcUrl,
      identityRegistryAddress, reputationRegistryAddress,
    );
    await agent.checkAndResetBudget();
    return agent;
  }

  get address(): string { return this.smartAccountAddress; }
  get eoaAddress(): string { return this.wallet.address; }

  async getBalance(): Promise<string> {
    try {
      const network = NETWORK_CONFIG[this.config.network];
      const client = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
      const balance = await client.readContract({
        address: network.usdcAddress, abi: ERC20_ABI,
        functionName: 'balanceOf', args: [this.smartAccountAddress],
      });
      return (Number(balance) / 10 ** network.usdcDecimals).toFixed(6);
    } catch { return '0'; }
  }

  async payForService(request: PaymentRequest): Promise<PaymentResult> {
    console.log(`\n💸 Processing payment: ${request.amount} USDC → ${request.to}`);
    if (request.memo) console.log(`   Memo: ${request.memo}`);
    await this.checkAndResetBudget();
    await this.validatePayment(request);
    const gasCostUSDC = await this.estimateGasCost();
    const totalCost = (parseFloat(request.amount) + parseFloat(gasCostUSDC)).toFixed(6);
    console.log(`   API cost:  $${request.amount} USDC`);
    console.log(`   Gas cost:  ~$${gasCostUSDC} USDC`);
    const balance = await this.getBalance();
    if (parseFloat(balance) < parseFloat(totalCost)) {
      throw new Error(`Insufficient balance: have ${balance} USDC, need ${totalCost} USDC. Send USDC to: ${this.smartAccountAddress}`);
    }
    const amountWei = parseUnits(request.amount, this.usdcDecimals);
    const transferData = encodeFunctionData({
      abi: ERC20_ABI, functionName: 'transfer', args: [request.to as Address, amountWei],
    });

    // For user-pays-erc20, the paymaster pulls USDC from the smart account via safeTransferFrom.
    // The smart account must approve the paymaster contract first.
    const network = NETWORK_CONFIG[this.config.network];
    const publicClient = createPublicClient({ chain: network.chain, transport: http(this.rpcUrl) });
    const currentAllowance = await publicClient.readContract({
      address: this.usdcAddress, abi: ERC20_ABI,
      functionName: 'allowance',
      args: [this.smartAccountAddress, this.paymasterAddress],
    });
    const approveAmount = parseUnits('1000', this.usdcDecimals); // approve 1000 USDC once

    let calls: Array<{ to: Address; data: `0x${string}`; value: bigint }>;
    if (currentAllowance < approveAmount) {
      const approveData = encodeFunctionData({
        abi: ERC20_ABI, functionName: 'approve',
        args: [this.paymasterAddress, approveAmount],
      });
      calls = [
        { to: this.usdcAddress, data: approveData, value: 0n },
        { to: this.usdcAddress, data: transferData, value: 0n },
      ];
      console.log(`   ✅  Approving paymaster to spend USDC...`);
    } else {
      calls = [{ to: this.usdcAddress, data: transferData, value: 0n }];
    }

    console.log(`   ✍️  Signing & submitting sponsored UserOp...`);
    const result = await this.smoothsend.submitCalls({
      calls,
      mode: 'user-pays-erc20',
      paymaster: { token: this.usdcAddress, precheckBalance: true },
      waitForReceipt: true,
    });
    console.log(`   ✅ Payment succeeded!`);
    console.log(`      UserOpHash: ${result.userOpHash}`);
    if (result.transactionHash) console.log(`      TxHash:     ${result.transactionHash}`);

    // Use actual gas cost from the on-chain receipt — actualGasCost is in wei
    // But the paymaster enforces a minimum fee floor ($0.01).
    const MIN_GAS_FEE_USD = 0.01;
    const avaxPriceUSD = 30; // rough AVAX/USD price
    const actualGasCostWei = result.receipt?.actualGasCost
      ? BigInt(result.receipt.actualGasCost)
      : 0n;
    const actualGasAvax = Number(actualGasCostWei) / 1e18;
    const actualGasUSD = Math.max(actualGasAvax * avaxPriceUSD, MIN_GAS_FEE_USD);
    const gasCost = actualGasUSD.toFixed(6);

    const realTotalCost = (parseFloat(request.amount) + parseFloat(gasCost)).toFixed(6);
    await this.recordSpending(parseFloat(realTotalCost));
    const budget = await this.getBudgetStatus();
    return {
      txHash: result.transactionHash ?? result.userOpHash, totalCost: realTotalCost,
      gasCost, apiCost: request.amount,
      remainingBudget: budget.remaining, receipt: result.receipt ?? undefined,
    };
  }

  async getRemainingDailyBudget(): Promise<string> {
    return (await this.getBudgetStatus()).remaining;
  }

  async getBudgetStatus(): Promise<BudgetStatus> {
    await this.checkAndResetBudget();
    const limit = parseFloat(this.config.dailyLimit);
    return {
      dailyLimit: this.config.dailyLimit, spentToday: this.dailySpent.toFixed(6),
      remaining: Math.max(0, limit - this.dailySpent).toFixed(6),
      txCount: this.txCountToday, resetsAt: this.getNextResetTime(),
    };
  }

  // ── ERC-8004: Identity Registration ────────────────────────

  /** Register this agent in the ERC-8004 IdentityRegistry. Returns the assigned agentId. */
  async registerIdentity(name: string, description: string): Promise<number> {
    const registrationFile = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name,
      description,
      image: '',
      services: [
        { name: 'x402', endpoint: `https://agent-wallet.vercel.app/api/merchant`, version: '1.0.0' },
      ],
      x402Support: true,
      active: true,
      registrations: [],
      supportedTrust: ['reputation'],
    };
    const agentURI = 'data:application/json;base64,' + Buffer.from(JSON.stringify(registrationFile)).toString('base64');

    const registerData = encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [agentURI],
    });

    console.log(`📝 Registering agent "${name}" in ERC-8004 IdentityRegistry...`);
    const result = await this.smoothsend.submitCalls({
      calls: [{ to: this._identityRegistryAddress, data: registerData, value: 0n }],
      mode: 'user-pays-erc20',
      paymaster: { token: this.usdcAddress, precheckBalance: true },
      waitForReceipt: true,
    });

    // Check tx hash — if absent, the tx likely failed
    if (!result.transactionHash) {
      throw new Error(`[AgentWallet] Registration transaction failed. Ensure your smart account has USDC balance.`);
    }

    // The agentId is emitted in the Registered event — we parse it from logs
    const agentId = this._parseAgentIdFromLogs(result.receipt?.logs ?? []);
    if (!agentId) throw new Error('[AgentWallet] Could not determine agentId from registration receipt');
    this._agentId = agentId;
    const txHash = result.transactionHash ?? result.userOpHash;
    console.log(`   ✅ Registered! Agent ID: ${agentId} — Tx: ${txHash}`);
    return agentId;
  }

  /** Parse agentId from IdentityRegistry.Registered event logs */
  private _parseAgentIdFromLogs(logs: any[]): number | null {
    for (const log of logs) {
      // IdentityRegistry emits Registered(uint256 indexed agentId, string agentURI, address indexed owner)
      // Topic[0] = keccak256("Registered(uint256,string,address)")
      const topic0 = log.topics?.[0];
      if (!topic0 || typeof topic0 !== 'string') continue;
      const regTopic = '0x47838e11de867dab89ceb6526646a4c747c0df7ff172aae9b43df6f5cd2fee4c';
      if (topic0.toLowerCase() === regTopic) {
        const data = log.topics?.[1];
        if (data) return Number(BigInt(data));
      }
    }
    return null;
  }

  // ── ERC-8004: Reputation ────────────────────────────────────

  /** Get reputation score for an agent from the ReputationRegistry */
  async getReputation(agentId: number): Promise<{ count: number; summaryValue: number; valueDecimals: number; score: number }> {
    const network = NETWORK_CONFIG[this.config.network];
    const client = createPublicClient({ chain: network.chain, transport: http(this.rpcUrl) });

    try {
      const result = await client.readContract({
        address: this._reputationRegistryAddress,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getSummary',
        args: [BigInt(agentId), [this.smartAccountAddress], '', ''],
      }) as [bigint, bigint, number];

      const count = Number(result[0]);
      const summaryValue = Number(result[1]);
      const valueDecimals = Number(result[2]);
      // Normalize to a 0-100 average score
      // summaryValue is the SUM of all feedback values. Divide by count for the average.
      const score = count > 0
        ? Math.min(100, Math.round(summaryValue / (10 ** valueDecimals) / count))
        : 0;
      return { count, summaryValue, valueDecimals, score };
    } catch {
      return { count: 0, summaryValue: 0, valueDecimals: 0, score: 0 };
    }
  }

  /** Submit reputation feedback about another agent after a transaction */
  async submitFeedback(input: FeedbackInput): Promise<string> {
    // Build args with proper types for the ABI
    const agentId = BigInt(input.agentId);
    const value = BigInt(Math.round(input.value * 10 ** 2));
    const tag1 = input.tag1 ?? 'x402';
    const tag2 = input.tag2 ?? '';
    const endpoint = '';
    const feedbackURI = input.feedbackURI ?? '';
    const feedbackHash = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

    const feedbackData = encodeFunctionData({
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'giveFeedback',
      // Use a relaxed type for the args tuple since viem's strict ABI typing
      // doesn't perfectly match our runtime values
      args: [agentId, value, 2 as const, tag1, tag2, endpoint, feedbackURI, feedbackHash] as unknown as readonly [bigint, bigint, number, string, string, string, string, `0x${string}`],
    });

    console.log(`⭐ Submitting feedback for agent #${input.agentId}: ${input.value} pts`);
    const result = await this.smoothsend.submitCalls({
      calls: [{ to: this._reputationRegistryAddress, data: feedbackData, value: 0n }],
      mode: 'user-pays-erc20',
      paymaster: { token: this.usdcAddress, precheckBalance: true },
      waitForReceipt: true,
    });
    const txHash = result.transactionHash ?? result.userOpHash;
    console.log(`   ✅ Feedback submitted! Tx: ${txHash}`);
    return txHash;
  }

  /** Get a marketplace listing for this wallet (after registration) */
  async getAgentListing(agentId: number): Promise<{
    identity: { agentId: number; owner: string; agentWallet: string };
    reputation: { count: number; score: number };
  }> {
    const network = NETWORK_CONFIG[this.config.network];
    const client = createPublicClient({ chain: network.chain, transport: http(this.rpcUrl) });

    const owner = await client.readContract({
      address: this._identityRegistryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [BigInt(agentId)],
    }) as Address;

    const agentWallet = await client.readContract({
      address: this._identityRegistryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'getAgentWallet',
      args: [BigInt(agentId)],
    }) as Address;

    const rep = await this.getReputation(agentId);

    return {
      identity: { agentId, owner, agentWallet },
      reputation: { count: rep.count, score: rep.score },
    };
  }

  private async validatePayment(request: PaymentRequest): Promise<void> {
    const amount = parseFloat(request.amount);
    if (amount > parseFloat(this.config.perTxLimit))
      throw new Error(`Amount ${amount} exceeds per-tx limit ${this.config.perTxLimit} USDC`);
    const gas = parseFloat(await this.estimateGasCost());
    if (this.dailySpent + amount + gas > parseFloat(this.config.dailyLimit))
      throw new Error(`Payment would exceed daily limit`);
    if (this.config.allowedMerchants?.length) {
      const lower = request.to.toLowerCase();
      if (!this.config.allowedMerchants.some(a => a.toLowerCase() === lower))
        throw new Error(`Merchant ${request.to} not in allowed list`);
    }
  }

  private async estimateGasCost(): Promise<string> {
    try {
      const net = this.config.network === 'avalanche-mainnet' ? 'mainnet' : 'fuji';
      const fees = await this.mcp.getTransactionFees(net);
      const nAvax = parseFloat(fees?.txFee || '1000000');
      return ((nAvax / 1e9) * 30).toFixed(6);
    } catch { return '0.02'; }
  }

  private async recordSpending(amount: number): Promise<void> {
    this.dailySpent += amount; this.txCountToday += 1;
  }

  private async checkAndResetBudget(): Promise<void> {
    const now = new Date();
    if (now.getUTCDate() !== this.lastResetDate.getUTCDate() ||
        now.getUTCMonth() !== this.lastResetDate.getUTCMonth() ||
        now.getUTCFullYear() !== this.lastResetDate.getUTCFullYear()) {
      this.dailySpent = 0; this.txCountToday = 0; this.lastResetDate = now;
    }
  }

  private getNextResetTime(): Date {
    const t = new Date(); t.setUTCDate(t.getUTCDate() + 1);
    t.setUTCHours(0, 0, 0, 0); return t;
  }

  exportPrivateKey(): string { return this.wallet.privateKey; }
}
