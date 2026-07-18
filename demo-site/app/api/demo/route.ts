import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

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
    const { AgentWallet, X402Client } = await import('@vedmohan/agent-wallet');

    // Read request body
    const body = await request.json().catch(() => ({}));

    // ── Handle agent registration (Marketplace tab) ─────────────
    if (body.action === 'register') {
      const wallet = await AgentWallet.create({
        smoothSendApiKey: process.env.SMOOTHSEND_API_KEY!,
        privateKey: process.env.PRIVATE_KEY || undefined,
        dailyLimit: process.env.WALLET_DAILY_LIMIT || '100',
        perTxLimit: process.env.WALLET_PER_TX_LIMIT || '10',
        network: (process.env.WALLET_NETWORK as any) || 'avalanche-fuji',
        privacyMode: body.privateMode ?? true,
        privacyRegistryAddress: process.env.PRIVATE_PAYMENT_ENVELOPE_REGISTRY || undefined,
      });

      const agentId = await wallet.registerIdentity(body.name, body.description);
      const balance = await wallet.getBalance();

      return NextResponse.json({
        success: true,
        agentId,
        txHash: `Registered agent #${agentId}`,
        wallet: { address: wallet.address, eoa: wallet.eoaAddress, balance },
      });
    }

    // ── Handle hire agent (Marketplace tab) ─────────────────────
    if (body.action === 'hire') {
      const wallet = await AgentWallet.create({
        smoothSendApiKey: process.env.SMOOTHSEND_API_KEY!,
        privateKey: process.env.PRIVATE_KEY || undefined,
        dailyLimit: process.env.WALLET_DAILY_LIMIT || '100',
        perTxLimit: process.env.WALLET_PER_TX_LIMIT || '10',
        network: (process.env.WALLET_NETWORK as any) || 'avalanche-fuji',
        privacyMode: body.privateMode ?? true,
        privacyRegistryAddress: process.env.PRIVATE_PAYMENT_ENVELOPE_REGISTRY || undefined,
      });

      // Pay $0.01 to the agent's wallet via x402
      const payment = await wallet.payForService({
        to: body.agentWallet,
        amount: '0.01',
        memo: `Hire agent #${body.agentId} via marketplace`,
      });

      // Submit reputation feedback for the hired agent (positive)
      let feedbackTx = '';
      try {
        feedbackTx = await wallet.submitFeedback({
          agentId: body.agentId,
          value: 85, // positive feedback score
          tag1: 'x402',
          tag2: 'hire',
          feedbackURI: `data:application/json,{"proofOfPayment":{"txHash":"${payment.txHash}"}}`,
        });
      } catch { /* feedback is optional */ }

      const balance = await wallet.getBalance();

      return NextResponse.json({
        success: true,
        txHash: payment.txHash,
        feedbackTx,
        payment,
        wallet: { address: wallet.address, eoa: wallet.eoaAddress, balance },
      });
    }

    // ── Handle weather x402 demo (default) ──────────────────────
    const city = body.city || 'Tokyo';

    addStep('Loading Agent Wallet', 'Connecting to SmoothSend bundler...', 'running');

    const wallet = await AgentWallet.create({
      smoothSendApiKey: process.env.SMOOTHSEND_API_KEY!,
      privateKey: process.env.PRIVATE_KEY || undefined,
      dailyLimit: process.env.WALLET_DAILY_LIMIT || '100',
      perTxLimit: process.env.WALLET_PER_TX_LIMIT || '10',
      network: (process.env.WALLET_NETWORK as any) || 'avalanche-fuji',
      privacyMode: body.privateMode ?? true,
      privacyRegistryAddress: process.env.PRIVATE_PAYMENT_ENVELOPE_REGISTRY || undefined,
    });

    steps[0].status = 'done';
    steps[0].detail = `Smart Account: ${wallet.address.slice(0, 10)}...${wallet.address.slice(-4)}`;

    const balance = await wallet.getBalance();
    addStep('Checking Balance', `$${parseFloat(balance).toFixed(2)} USDC`, 'done');

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;
    const merchantUrl = `${baseUrl}/api/merchant?type=weather&city=${encodeURIComponent(city)}`;

    addStep('x402 Request', `→ ${merchantUrl}`, 'running');

    const x402 = new X402Client({ wallet });

    const rawResponse = await x402['rawRequest']({ url: merchantUrl, method: 'GET' });

    if (rawResponse.status !== 402) {
      throw new Error(`Expected 402, got ${rawResponse.status}`);
    }

    addStep('402 Payment Required', `$${rawResponse.headers['x-payment-price']} USDC required`, 'done');
    addStep('Processing Payment', 'Sending via SmoothSend user-pays-erc20 bundler...', 'running');

    const result = await x402.request(merchantUrl);

    steps[steps.length - 1].status = 'done';
    const estimatedGas = result.payment?.estimatedGasCost ?? result.payment?.gasCost;
    const actualGas = result.payment?.actualGasCost ?? result.payment?.gasCost;
    steps[steps.length - 1].detail =
      `$${result.payment?.apiCost} API + est $${estimatedGas} / settled $${actualGas} · Tx: ${result.payment?.txHash?.slice(0, 18)}...`;

    addStep('Data Received', `${result.data.city}: ${result.data.temperature}°C, ${result.data.condition}`, 'done');

    const budget = await wallet.getBudgetStatus();

    return NextResponse.json({
      success: true,
      duration: Date.now() - startTime,
      steps,
      result: { weather: result.data },
      payment: result.payment,
      wallet: { address: wallet.address, eoa: wallet.eoaAddress, balance, budget },
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
