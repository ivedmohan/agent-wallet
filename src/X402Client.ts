import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import type { PaymentResult, X402ClientConfig, X402Result } from './types.js';

const HEADER_PRICE = 'x-payment-price';
const HEADER_RECIPIENT = 'x-payment-recipient';
const HEADER_TOKEN = 'x-payment-token';
const HEADER_MEMO = 'x-payment-memo';
const HEADER_PAYMENT_TX = 'x-payment-tx';

export class X402Client {
  private wallet: X402ClientConfig['wallet'];

  constructor(private config: X402ClientConfig) {
    this.wallet = config.wallet;
  }

  async request(urlOrConfig: string | AxiosRequestConfig): Promise<X402Result> {
    const config: AxiosRequestConfig =
      typeof urlOrConfig === 'string' ? { url: urlOrConfig, method: 'GET' } : urlOrConfig;

    if (!config.url) throw new Error('[X402Client] URL is required');

    const firstResponse = await this.rawRequest(config);

    if (firstResponse.status !== 402) {
      return { data: firstResponse.data, status: firstResponse.status, paid: false };
    }

    const paymentReq = this.parse402Response(firstResponse, config.url);
    console.log(`\n⚡ x402: API requires payment — $${paymentReq.amount} USDC → ${paymentReq.to}`);

    const payment = await this.wallet.payForService({
      to: paymentReq.to,
      amount: paymentReq.amount,
      token: paymentReq.token,
      memo: paymentReq.memo ?? `x402: ${config.url}`,
    });

    console.log(`   ✅ Paid! TxHash: ${payment.txHash}`);
    console.log(`   💰 Total cost: $${payment.totalCost} USDC (fee + gas)`);

    const retryResponse = await this.rawRequest({
      ...config,
      headers: { ...config.headers, [HEADER_PAYMENT_TX]: payment.txHash },
    });

    return { data: retryResponse.data, status: retryResponse.status, payment, paid: true };
  }

  async batch(urls: (string | AxiosRequestConfig)[]): Promise<X402Result[]> {
    return Promise.all(urls.map((u) => this.request(u)));
  }

  private async rawRequest(config: AxiosRequestConfig): Promise<AxiosResponse> {
    return axios({ timeout: 30_000, validateStatus: () => true, ...config });
  }

  private parse402Response(response: AxiosResponse, originalUrl: string) {
    const headers = response.headers;
    const to = headers[HEADER_RECIPIENT];
    if (!to) throw new Error(`[X402Client] 402 response missing "${HEADER_RECIPIENT}" header.\nURL: ${originalUrl}`);
    const amount = headers[HEADER_PRICE];
    if (!amount) throw new Error(`[X402Client] 402 response missing "${HEADER_PRICE}" header.\nURL: ${originalUrl}`);
    return {
      to,
      amount,
      token: headers[HEADER_TOKEN],
      memo: headers[HEADER_MEMO] ?? `x402: ${originalUrl}`,
    };
  }
}
