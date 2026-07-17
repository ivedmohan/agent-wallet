export interface AgentWalletConfig {
  smoothSendApiKey: string;
  dailyLimit: string;
  perTxLimit: string;
  allowedMerchants?: string[];
  network: 'avalanche-fuji' | 'avalanche-mainnet';
  privateKey?: string;
  rpcUrl?: string;
  /** When true, payment outputs are redacted by default for privacy-first demos */
  privacyMode?: boolean;
  /** Optional registry for private payment envelopes */
  privacyRegistryAddress?: string;
  /** Optional bridge for encrypted ERC transfers */
  eercBridge?: EercBridge;
  /** Optional default encrypted token address */
  eercTokenAddress?: string;
  /** Optional decimals for encrypted token amounts */
  eercDecimals?: number;
  /** ERC-8004 IdentityRegistry contract address (default: Fuji deployment) */
  identityRegistryAddress?: string;
  /** ERC-8004 ReputationRegistry contract address (default: Fuji deployment) */
  reputationRegistryAddress?: string;
}

export interface PaymentRequest {
  to: string;
  amount: string;
  memo?: string;
  token?: string;
  /** Request a redacted payment summary for privacy-first demos */
  private?: boolean;
}

export interface PaymentDisplay {
  private: boolean;
  amount: string;
  gasCost: string;
  totalCost: string;
  apiCost: string;
  txHash: string;
  recipient: string;
  memo?: string;
}

export interface PaymentResult {
  txHash: string;
  totalCost: string;
  gasCost: string;
  estimatedGasCost?: string;
  actualGasCost?: string;
  apiCost: string;
  remainingBudget: string;
  receipt?: any;
  display?: PaymentDisplay;
  privacyEnvelopeId?: string;
  privacyPayloadHash?: string;
  /** Optional ERC-8004 feedback tx hash if post-payment feedback was submitted */
  feedbackTxHash?: string;
}

export interface BudgetStatus {
  dailyLimit: string;
  spentToday: string;
  remaining: string;
  txCount: number;
  resetsAt: Date;
}

export interface SpendingGuard {
  canPay(amount: string): Promise<boolean>;
  recordPayment(amount: string): Promise<void>;
  getStatus(): Promise<BudgetStatus>;
  reset(): Promise<void>;
}

export interface X402PaymentRequest {
  amount: string;
  to: string;
  token?: string;
  memo?: string;
  url: string;
}

export interface X402ClientConfig {
  wallet: { payForService(req: PaymentRequest): Promise<PaymentResult> };
}

export interface X402Result {
  data: any;
  status: number;
  payment?: PaymentResult;
  paid: boolean;
}

export interface EncryptedBalanceSnapshot {
  decryptedBalance: bigint;
  parsedDecryptedBalance: string;
  encryptedBalance: bigint[];
  auditorPublicKey: bigint[];
  decimals: bigint;
}

export interface EercTransferResult {
  transactionHash: string;
  receiverEncryptedAmount?: string[];
  senderEncryptedAmount?: string[];
}

export interface EercBridge {
  getBalanceSnapshot(tokenAddress?: string): Promise<EncryptedBalanceSnapshot>;
  transfer(
    to: string,
    amount: bigint,
    tokenAddress?: string,
  ): Promise<EercTransferResult>;
  register?(): Promise<{ key: string; transactionHash: string }>;
  generateDecryptionKey?(): Promise<string>;
  deposit?(amount: bigint, tokenAddress: string): Promise<EercTransferResult>;
  withdraw?(
    amount: bigint,
    tokenAddress: string,
  ): Promise<EercTransferResult>;
}

// ── ERC-8004 Types ────────────────────────────────────────────

/** An agent's on-chain identity from the IdentityRegistry */
export interface AgentIdentity {
  agentId: number;
  agentURI: string;
  owner: string;
  agentWallet: string;
}

/** Reputation summary for an agent from the ReputationRegistry */
export interface AgentReputation {
  count: number;
  summaryValue: number;
  valueDecimals: number;
  /** Scored 0-100 for display */
  score: number;
}

/** Input for submitting reputation feedback */
export interface FeedbackInput {
  agentId: number;
  value: number;
  tag1?: string;
  tag2?: string;
  /** URI to proof-of-payment file */
  feedbackURI?: string;
}

/** An agent's marketplace listing */
export interface AgentListing {
  agentId: number;
  name: string;
  description: string;
  owner: string;
  agentWallet: string;
  services: Array<{ name: string; endpoint: string }>;
  reputation: AgentReputation;
}
