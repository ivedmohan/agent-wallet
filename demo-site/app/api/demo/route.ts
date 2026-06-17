import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/demo
 * Runs the full x402 flow server-side and returns each step with timing.
 * The frontend animates through these steps.
 */
export async function POST(request: NextRequest) {
  const steps: Array<{ step: number; label: string; status: string; detail: string; duration?: number }> = [];
  const startTime = Date.now();

  function addStep(label: string, detail: string, status: 'running' | 'done' | 'error') {
    steps.push({
      step: steps.length + 1,
      label,
      detail,
      status,
      duration: Date.now() - startTime,
    });
  }

  try {
    addStep('Loading Agent Wallet', 'Connecting to SmoothSend bundler...', 'running');

    // 1. Create the wallet (uses SmoothSend SK from env)
    const { AgentWallet } = await import('@agent-wallet/AgentWallet.js');
    const { X402Client } = await import('@agent-wallet/X402Client.js');

    const wallet = await AgentWallet.create({
      smoothSendApiKey: process.env.SMOOTHSEND_API_KEY!,
      dailyLimit: process.env.WALLET_DAILY_LIMIT || '100',
      perTxLimit: process.env.WALLET_PER_TX_LIMIT || '10',
      network: (process.env.WALLET_NETWORK as any) || 'avalanche-fuji',
    });

    steps[0].status = 'done';
    steps[0].detail = `Smart Account: ${wallet.address.slice(0, 10)}...${wallet.address.slice(-4)}`;

    const balance = await wallet.getBalance();
    addStep('Checking Balance', `$${parseFloat(balance).toFixed(2)} USDC`, 'done');

    // 2. Determine the base URL (for the merchant endpoint)
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    addStep('x402 Request', `→ ${baseUrl}/api/merchant?type=weather&city=Tokyo`, 'running');

    // 3. Run the x402 flow
    const x402 = new X402Client({ wallet });

    // First make a direct request to show the 402
    const rawResponse = await x402['rawRequest']({
      url: `${baseUrl}/api/merchant?type=weather&city=Tokyo`,
      method: 'GET',
    });

    if (rawResponse.status !== 402) {
      throw new Error(`Expected 402, got ${rawResponse.status}`);
    }

    addStep('402 Payment Required', `$${rawResponse.headers['x-payment-price']} USDC required`, 'done');
    addStep('Processing Payment', `Sending via SmoothSend user-pays-erc20 bundler...`, 'running');

    // 4. Pay and retry via X402Client
    const result = await x402.request(`${baseUrl}/api/merchant?type=weather&city=Tokyo`);

    steps[steps.length - 1].status = 'done';
    steps[steps.length - 1].detail = `TxHash: ${result.payment?.txHash.slice(0, 18)}...`;
    steps[steps.length - 1].detail = `$${result.payment?.totalCost} USDC · Tx: ${result.payment?.txHash?.slice(0, 18)}...`;

    addStep('Data Received', `${result.data.city}: ${result.data.temperature}°C, ${result.data.condition}`, 'done');

    // 5. Do a crypto lookup too to show batch capability
    addStep('Batch Crypto Prices', 'Requesting AVAX, BTC, ETH...', 'running');

    const batchResult = await x402.request({
      url: `${baseUrl}/api/merchant?type=crypto&symbol=AVAX`,
      method: 'GET',
    });

    steps[steps.length - 1].status = 'done';
    steps[steps.length - 1].detail = `AVAX: $${batchResult.data.price}`;

    // 6. Budget status
    const budget = await wallet.getBudgetStatus();

    return NextResponse.json({
      success: true,
      duration: Date.now() - startTime,
      steps,
      result: {
        weather: result.data,
        crypto: batchResult.data,
      },
      payment: result.payment,
      wallet: {
        address: wallet.address,
        eoa: wallet.eoaAddress,
        balance,
        budget,
      },
      network: process.env.WALLET_NETWORK || 'avalanche-fuji',
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    addStep('Error', msg, 'error');
    return NextResponse.json(
      { success: false, duration: Date.now() - startTime, steps, error: msg },
      { status: 500 }
    );
  }
}
