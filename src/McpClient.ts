import axios from 'axios';

export class McpClient {
  private readonly baseUrl: string;
  private requestId: number = 1;

  constructor(baseUrl: string = 'https://build.avax.network/api/mcp') {
    this.baseUrl = baseUrl;
  }

  async listTools(): Promise<any[]> {
    const response = await this.request('tools/list', {});
    return response.tools || [];
  }

  async call<T = any>(toolName: string, args: Record<string, any>): Promise<T> {
    const response = await this.request('tools/call', {
      name: toolName,
      arguments: args,
    });
    return response.content?.[0]?.text || response;
  }

  async lookupTransaction(txHash: string, network: 'mainnet' | 'fuji' = 'fuji'): Promise<any> {
    return this.call('blockchain_lookup_transaction', { txHash, network });
  }

  async getTransactionFees(network: 'mainnet' | 'fuji' = 'fuji'): Promise<any> {
    return this.call('info_get_tx_fee', { network });
  }

  private async request(method: string, params: any): Promise<any> {
    const id = this.requestId++;
    const response = await axios.post(this.baseUrl, { jsonrpc: '2.0', method, params, id }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    if (response.data.error) {
      throw new Error(`MCP Error: ${response.data.error.message}`);
    }
    return response.data.result;
  }
}
