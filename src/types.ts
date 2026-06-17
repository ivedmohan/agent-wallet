export interface AgentWalletConfig {
  smoothSendApiKey: string;
  dailyLimit: string;
  perTxLimit: string;
  allowedMerchants?: string[];
  network: 'avalanche-fuji' | 'avalanche-mainnet';
  privateKey?: string;
  rpcUrl?: string;
}

export interface PaymentRequest {
  to: string;
  amount: string;
  memo?: string;
  token?: string;
}

export interface PaymentResult {
  txHash: string;
  totalCost: string;
  gasCost: string;
  apiCost: string;
  remainingBudget: string;
  receipt?: any;
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
