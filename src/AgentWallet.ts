import { Wallet, type HDNodeWallet, id } from 'ethers';
import {
  createPublicClient, createWalletClient, http,
  encodeAbiParameters, encodeFunctionData, formatUnits, keccak256, parseUnits, type Address, type Log,
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
  EercBridge, EncryptedBalanceSnapshot, EercTransferResult,
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

const ERC20_TRANSFER_TOPIC = id('Transfer(address,address,uint256)');

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

const PRIVATE_PAYMENT_ENVELOPE_REGISTRY_ABI = [
  { name: 'commitEnvelope', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'payloadHash', type: 'bytes32' },
      { name: 'salt', type: 'bytes32' },
      { name: 'ciphertext', type: 'bytes' },
    ],
    outputs: [{ name: 'envelopeId', type: 'bytes32' }] },
  { name: 'markExecuted', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'envelopeId', type: 'bytes32' },
      { name: 'executionHash', type: 'bytes32' },
    ],
    outputs: [] },
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
  private privacyRegistryAddress?: Address;
  private eercBridge?: EercBridge;
  private eercTokenAddress?: Address;
  private eercDecimals: number;
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
    privacyRegistryAddress: Address | undefined,
    identityRegistryAddress: Address, reputationRegistryAddress: Address,
    eercBridge: EercBridge | undefined,
    eercTokenAddress: Address | undefined,
    eercDecimals: number,
  ) {
    this.wallet = wallet; this.smoothsend = smoothsend;
    this.mcp = new McpClient(); this.config = config;
    this.smartAccountAddress = smartAccountAddress;
    this.usdcAddress = usdcAddress; this.usdcDecimals = usdcDecimals;
    this.paymasterAddress = paymasterAddress;
    this.rpcUrl = rpcUrl;
    this.privacyRegistryAddress = privacyRegistryAddress;
    this.eercBridge = eercBridge;
    this.eercTokenAddress = eercTokenAddress;
    this.eercDecimals = eercDecimals;
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
    const privacyRegistryAddress = config.privacyRegistryAddress
      ? (config.privacyRegistryAddress as Address)
      : undefined;
    const eercTokenAddress = config.eercTokenAddress
      ? (config.eercTokenAddress as Address)
      : undefined;
    const eercDecimals = config.eercDecimals ?? 2;
    console.log(`🏦 Smart Account:   ${smartAccountAddress}`);
    console.log(`💳 USDC Token:      ${network.usdcAddress}`);
    console.log(`⛽ Paymaster:       ${paymasterAddress}`);
    if (privacyRegistryAddress) console.log(`🔒 Privacy Registry: ${privacyRegistryAddress}`);
    if (config.eercBridge) {
      console.log(`🧩 eERC bridge:     enabled`);
      if (eercTokenAddress) console.log(`🪙 eERC token:      ${eercTokenAddress}`);
      console.log(`🔢 eERC decimals:   ${eercDecimals}`);
    }

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
      privacyRegistryAddress,
      identityRegistryAddress, reputationRegistryAddress,
      config.eercBridge,
      eercTokenAddress,
      eercDecimals,
    );
    await agent.checkAndResetBudget();
    return agent;
  }

  get address(): string { return this.smartAccountAddress; }
  get eoaAddress(): string { return this.wallet.address; }

  private isPrivatePayment(request: PaymentRequest): boolean {
    return request.private ?? this.config.privacyMode ?? false;
  }

  private redactAmount(amount: string, privateMode: boolean): string {
    return privateMode ? 'Confidential' : `$${amount} USDC`;
  }

  private redactAddress(address: string, privateMode: boolean): string {
    return privateMode ? `${address.slice(0, 8)}...hidden` : address;
  }

  private buildPrivatePayloadHash(request: PaymentRequest): `0x${string}` {
    return id(JSON.stringify({
      to: request.to,
      amount: request.amount,
      memo: request.memo ?? '',
      token: request.token ?? this.usdcAddress,
      network: this.config.network,
    })) as `0x${string}`;
  }

  private buildPrivateEnvelopeSalt(): `0x${string}` {
    return id(Wallet.createRandom().address) as `0x${string}`;
  }

  private resolvePrivateTokenAddress(request: PaymentRequest): Address {
    const tokenAddress = request.token ?? this.eercTokenAddress;
    if (!tokenAddress) {
      throw new Error('[AgentWallet] privateTransfer requires eercTokenAddress or request.token.');
    }
    return tokenAddress as Address;
  }

  private computePrivateEnvelopeId(
    recipient: Address,
    payloadHash: `0x${string}`,
    salt: `0x${string}`,
  ): `0x${string}` | undefined {
    if (!this.privacyRegistryAddress) return undefined;
    const network = NETWORK_CONFIG[this.config.network];
    return keccak256(encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [
        this.wallet.address as Address,
        recipient,
        payloadHash,
        salt,
        BigInt(network.chain.id),
        this.privacyRegistryAddress,
      ],
    ));
  }

  private buildPaymentDisplay(
    request: PaymentRequest,
    txHash: string,
    totalCost: string,
    gasCost: string,
    privateMode: boolean,
  ): import('./types.js').PaymentDisplay {
    return {
      private: privateMode,
      amount: this.redactAmount(request.amount, privateMode),
      gasCost: this.redactAmount(gasCost, privateMode),
      totalCost: this.redactAmount(totalCost, privateMode),
      apiCost: this.redactAmount(request.amount, privateMode),
      txHash: privateMode ? 'Hidden until reveal' : txHash,
      recipient: this.redactAddress(request.to, privateMode),
      memo: privateMode ? 'Hidden until reveal' : (request.memo ?? ''),
    };
  }

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
    const privateMode = this.isPrivatePayment(request);
    console.log(
      `\n💸 Processing ${privateMode ? 'private ' : ''}payment: ${this.redactAmount(request.amount, privateMode)} → ${this.redactAddress(request.to, privateMode)}`
    );
    if (request.memo && !privateMode) console.log(`   Memo: ${request.memo}`);
    await this.checkAndResetBudget();
    await this.validatePayment(request);
    if (privateMode && this.eercBridge) {
      return this.privateTransfer(request);
    }
    console.log(`   API cost:  ${this.redactAmount(request.amount, privateMode)}`);
    const amountWei = parseUnits(request.amount, this.usdcDecimals);
    const transferData = encodeFunctionData({
      abi: ERC20_ABI, functionName: 'transfer', args: [request.to as Address, amountWei],
    });
    const privatePayloadHash = privateMode ? this.buildPrivatePayloadHash(request) : undefined;
    const privateEnvelopeSalt = privateMode ? this.buildPrivateEnvelopeSalt() : undefined;
    let privateEnvelopeData: `0x${string}` | undefined;
    if (privateMode && this.privacyRegistryAddress && privatePayloadHash && privateEnvelopeSalt) {
      privateEnvelopeData = encodeFunctionData({
        abi: PRIVATE_PAYMENT_ENVELOPE_REGISTRY_ABI,
        functionName: 'commitEnvelope',
        args: [
          request.to as Address,
          privatePayloadHash,
          privateEnvelopeSalt,
          '0x',
        ],
      });
    }

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
    if (privateEnvelopeData && this.privacyRegistryAddress) {
      calls = [{ to: this.privacyRegistryAddress, data: privateEnvelopeData, value: 0n }];
    } else {
      calls = [];
    }
    if (currentAllowance < approveAmount) {
      const approveData = encodeFunctionData({
        abi: ERC20_ABI, functionName: 'approve',
        args: [this.paymasterAddress, approveAmount],
      });
      calls = [
        ...calls,
        { to: this.usdcAddress, data: approveData, value: 0n },
        { to: this.usdcAddress, data: transferData, value: 0n },
      ];
      console.log(`   ✅  Approving paymaster to spend USDC...`);
    } else {
      calls = [
        ...calls,
        { to: this.usdcAddress, data: transferData, value: 0n },
      ];
    }

    const sdkGasCost = await this.estimateSmoothSendGasCost(calls);
    const estimatedGasCostUSDC = sdkGasCost ?? await this.estimateGasCost();
    const totalCost = (parseFloat(request.amount) + parseFloat(estimatedGasCostUSDC)).toFixed(6);
    console.log(`   Gas cost:  ~${this.redactAmount(estimatedGasCostUSDC, privateMode)}${sdkGasCost ? ' (SmoothSend SDK)' : ' (fallback estimate)'}`);

    const balance = await this.getBalance();
    if (parseFloat(balance) < parseFloat(totalCost)) {
      throw new Error(`Insufficient balance: have ${balance} USDC, need ${totalCost} USDC. Send USDC to: ${this.smartAccountAddress}`);
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
    if (result.transactionHash) {
      console.log(`      TxHash:     ${privateMode ? 'hidden' : result.transactionHash}`);
    }

    const actualGasCost = this.parseActualGasCostUSDC(result.receipt?.logs, request.to as Address);
    const gasCost = actualGasCost ?? estimatedGasCostUSDC;
    const realTotalCost = (parseFloat(request.amount) + parseFloat(gasCost)).toFixed(6);
    await this.recordSpending(parseFloat(realTotalCost));
    const budget = await this.getBudgetStatus();
    const txHash = result.transactionHash ?? result.userOpHash;
    const privacyEnvelopeId = (privateEnvelopeData && privatePayloadHash && privateEnvelopeSalt)
      ? this.computePrivateEnvelopeId(request.to as Address, privatePayloadHash, privateEnvelopeSalt)
      : undefined;
    return {
      txHash,
      totalCost: realTotalCost,
      gasCost, estimatedGasCost: estimatedGasCostUSDC, actualGasCost: actualGasCost ?? gasCost,
      apiCost: request.amount,
      remainingBudget: budget.remaining, receipt: result.receipt ?? undefined,
      privacyEnvelopeId,
      privacyPayloadHash: privatePayloadHash,
      display: this.buildPaymentDisplay(request, txHash, realTotalCost, gasCost, privateMode),
    };
  }

  async getEncryptedBalance(tokenAddress?: string): Promise<EncryptedBalanceSnapshot> {
    if (!this.eercBridge) {
      throw new Error('[AgentWallet] eERC bridge is not configured.');
    }
    return this.eercBridge.getBalanceSnapshot(tokenAddress ?? this.eercTokenAddress);
  }

  async privateTransfer(request: PaymentRequest): Promise<PaymentResult> {
    if (!this.eercBridge) {
      throw new Error('[AgentWallet] eERC bridge is not configured.');
    }

    const tokenAddress = this.resolvePrivateTokenAddress(request);
    const amountUnits = parseUnits(request.amount, this.eercDecimals);
    const snapshot = await this.eercBridge.getBalanceSnapshot(tokenAddress);

    console.log(
      `\n🔒 Processing private payment: ${this.redactAmount(request.amount, true)} → ${this.redactAddress(request.to, true)}`
    );
    if (snapshot.decryptedBalance < amountUnits) {
      throw new Error(`Insufficient encrypted balance: need ${request.amount}, have ${snapshot.parsedDecryptedBalance}`);
    }

    const transfer = await this.eercBridge.transfer(request.to, amountUnits, tokenAddress);
    const txHash = transfer.transactionHash;
    await this.recordSpending(parseFloat(request.amount));
    const budget = await this.getBudgetStatus();

    return {
      txHash,
      totalCost: request.amount,
      gasCost: '0',
      estimatedGasCost: '0',
      actualGasCost: '0',
      apiCost: request.amount,
      remainingBudget: budget.remaining,
      receipt: undefined,
      display: this.buildPaymentDisplay(request, txHash, request.amount, '0', true),
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

    // Check UserOp receipt success flag for a better error on revert
    if (result.receipt && !result.receipt.success) {
      throw new Error(`[AgentWallet] Registration UserOperation reverted. Reason: ${result.receipt.reason ?? 'unknown'}. Ensure your smart account has USDC balance.`);
    }

    // Fetch the actual TransactionReceipt from the chain — this is more reliable
    // than parsing UserOperationReceipt logs, which can have format inconsistencies.
    const network = NETWORK_CONFIG[this.config.network];
    const publicClient = createPublicClient({ chain: network.chain, transport: http(this.rpcUrl) });
    const txHash = result.transactionHash as `0x${string}`;
    const txReceipt = await publicClient.getTransactionReceipt({ hash: txHash });

    const agentId = this._parseAgentIdFromLogs(txReceipt.logs);
    if (!agentId) throw new Error('[AgentWallet] Could not determine agentId from transaction receipt logs');
    this._agentId = agentId;
    console.log(`   ✅ Registered! Agent ID: ${agentId} — Tx: ${txHash}`);
    return agentId;
  }

  /** Parse agentId from IdentityRegistry.Registered event logs.
   *  Accepts viem Log[] (from TransactionReceipt) for reliable format.
   *  Uses ethers to compute the event topic at runtime.
   */
  private _parseAgentIdFromLogs(logs: Log[]): number | null {
    const regTopic = id('Registered(uint256,string,address)').toLowerCase();

    for (const log of logs) {
      if (!log.topics?.length) continue;
      const topic0 = log.topics[0]?.toLowerCase();
      if (!topic0) continue;
      if (topic0 === regTopic) {
        // agentId is the first indexed parameter → topics[1]
        const agentIdData = log.topics[1];
        if (agentIdData) return Number(BigInt(agentIdData));
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

  private async estimateSmoothSendGasCost(calls: Array<{ to: Address; data: `0x${string}`; value: bigint }>): Promise<string | null> {
    try {
      const estimate = await this.smoothsend.estimateUserPaysFee({
        calls,
        paymaster: { token: this.usdcAddress, precheckBalance: true },
      });
      const tokenFee = estimate.feePreview?.predictedTokenFee;
      if (!tokenFee) return null;
      try {
        return Number(formatUnits(BigInt(tokenFee), this.usdcDecimals)).toFixed(6);
      } catch {
        const decimalFee = Number(tokenFee);
        return Number.isFinite(decimalFee) ? decimalFee.toFixed(6) : null;
      }
    } catch {
      return null;
    }
  }

  private parseActualGasCostUSDC(logs: unknown, merchantAddress: Address): string | null {
    if (!Array.isArray(logs)) return null;
    const merchant = merchantAddress.toLowerCase();
    const smartAccount = this.smartAccountAddress.toLowerCase();
    const token = this.usdcAddress.toLowerCase();

    for (const log of logs) {
      if (!log || typeof log !== 'object') continue;
      const entry = log as {
        address?: string;
        topics?: string[];
        data?: string;
      };
      if (!entry.address || entry.address.toLowerCase() !== token) continue;
      if (!Array.isArray(entry.topics) || entry.topics.length < 3) continue;
      if (entry.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC.toLowerCase()) continue;

      const fromTopic = `0x${entry.topics[1].slice(-40)}`.toLowerCase();
      const toTopic = `0x${entry.topics[2].slice(-40)}`.toLowerCase();
      if (fromTopic !== smartAccount) continue;
      if (toTopic === merchant) continue;
      if (!entry.data) continue;

      try {
        return (Number(BigInt(entry.data)) / 10 ** this.usdcDecimals).toFixed(6);
      } catch {
        return null;
      }
    }

    return null;
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
