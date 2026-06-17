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
    // Read city from request body
    const body = await request.json().catch(() => ({}));
    const city = body.city || 'Tokyo';

    addStep('Loading Agent Wallet', 'Connecting to SmoothSend bundler...', 'running');

    // 1. Create the wallet (uses SmoothSend SK from env)
    // Use local dist for development, npm package for production (Vercel)
    const { AgentWallet, X402Client } = process.env.VERCEL
      ? await import('@vedmohan/agent-wallet')
      : await import('../../../../dist/index.js');

    const wallet = await AgentWallet.create({
      smoothSendApiKey: process.env.SMOOTHSEND_API_KEY!,
      privateKey: process.env.PRIVATE_KEY || undefined,
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
    const merchantUrl = `${baseUrl}/api/merchant?type=weather&city=${encodeURIComponent(city)}`;

    addStep('x402 Request', `→ ${merchantUrl}`, 'running');

    // 3. Run the x402 flow
    const x402 = new X402Client({ wallet });

    // First make a direct request to show the 402
    const rawResponse = await x402['rawRequest']({
      url: merchantUrl,
      method: 'GET',
    });

    if (rawResponse.status !== 402) {
      throw new Error(`Expected 402, got ${rawResponse.status}`);
    }

    addStep('402 Payment Required', `$${rawResponse.headers['x-payment-price']} USDC required`, 'done');
    addStep('Processing Payment', `Sending via SmoothSend user-pays-erc20 bundler...`, 'running');

    // 4. Pay and retry via X402Client
    const result = await x402.request(merchantUrl);

    steps[steps.length - 1].status = 'done';
    const gasDetail = result.payment?.gasCost && parseFloat(result.payment.gasCost) > 0.0001
      ? `Gas: ~$${parseFloat(result.payment.gasCost).toFixed(4)}`
      : `Gas: <$0.0001`;
    steps[steps.length - 1].detail = `$${result.payment?.apiCost} API + ${gasDetail} · Tx: ${result.payment?.txHash?.slice(0, 18)}...`;

    addStep('Data Received', `${result.data.city}: ${result.data.temperature}°C, ${result.data.condition}`, 'done');

    // 5. Budget status
    const budget = await wallet.getBudgetStatus();

    return NextResponse.json({
      success: true,
      duration: Date.now() - startTime,
      steps,
      result: { weather: result.data },
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
