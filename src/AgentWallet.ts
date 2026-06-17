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
import type { AgentWalletConfig, PaymentRequest, PaymentResult, BudgetStatus } from './types.js';

const ERC20_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
] as const;

const NETWORK_CONFIG = {
  'avalanche-fuji': {
    chain: avalancheFuji,
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    usdcAddress: '0x5425890298aed601595a70AB815c96711a31Bc65' as Address,
    usdcDecimals: 6,
    networkLabel: 'testnet' as const,
  },
  'avalanche-mainnet': {
    chain: avalanche,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    usdcAddress: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' as Address,
    usdcDecimals: 6,
    networkLabel: 'mainnet' as const,
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
  private dailySpent: number = 0;
  private txCountToday: number = 0;
  private lastResetDate: Date = new Date();

  private constructor(
    wallet: Wallet | HDNodeWallet, smoothsend: SmoothSendAvaxClient,
    config: AgentWalletConfig, smartAccountAddress: Address,
    usdcAddress: Address, usdcDecimals: number,
  ) {
    this.wallet = wallet; this.smoothsend = smoothsend;
    this.mcp = new McpClient(); this.config = config;
    this.smartAccountAddress = smartAccountAddress;
    this.usdcAddress = usdcAddress; this.usdcDecimals = usdcDecimals;
  }

  static async create(config: AgentWalletConfig): Promise<AgentWallet> {
    const wallet = config.privateKey ? new Wallet(config.privateKey) : Wallet.createRandom();
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
    console.log(`🏦 Smart Account:   ${smartAccountAddress}`);
    console.log(`💳 USDC Token:      ${network.usdcAddress}`);
    const agent = new AgentWallet(wallet, smoothsend, config, smartAccountAddress, network.usdcAddress, network.usdcDecimals);
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
    console.log(`   ✍️  Signing & submitting sponsored UserOp...`);
    const result = await this.smoothsend.submitCall({
      call: { to: this.usdcAddress, data: transferData, value: 0n },
      mode: 'user-pays-erc20',
      paymaster: { token: this.usdcAddress, precheckBalance: true },
      waitForReceipt: true,
    });
    console.log(`   ✅ Payment succeeded!`);
    console.log(`      UserOpHash: ${result.userOpHash}`);
    if (result.transactionHash) console.log(`      TxHash:     ${result.transactionHash}`);
    await this.recordSpending(parseFloat(totalCost));
    const budget = await this.getBudgetStatus();
    return {
      txHash: result.transactionHash ?? result.userOpHash, totalCost,
      gasCost: gasCostUSDC, apiCost: request.amount,
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
