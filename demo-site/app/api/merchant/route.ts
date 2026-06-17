import { NextRequest, NextResponse } from 'next/server';

const MERCHANT_ADDRESS = '0x0000000000000000000000000000000000000001';
const DEFAULT_PRICE = '0.25';
const ACCEPTED_TOKEN = 'USDC';

// Demo data
const WEATHER_DATA: Record<string, { temp: number; condition: string; humidity: number }> = {
  tokyo:  { temp: 25, condition: 'sunny',      humidity: 45 },
  london: { temp: 14, condition: 'cloudy',     humidity: 72 },
  dubai:  { temp: 38, condition: 'clear',      humidity: 20 },
  nyc:    { temp: 22, condition: 'partly cloudy', humidity: 55 },
  singapore: { temp: 30, condition: 'thunderstorms', humidity: 85 },
};

const CRYPTO_PRICES: Record<string, { price: number; change24h: string }> = {
  avax: { price: 30.42, change24h: '+3.2%' },
  btc:  { price: 68450, change24h: '+1.8%' },
  eth:  { price: 3450,  change24h: '+2.1%' },
  sol:  { price: 142.80, change24h: '+5.4%' },
  link: { price: 15.67, change24h: '-0.8%' },
};

// Simple in-memory payment verification (demo only — real would verify on-chain)
const verifiedPayments = new Set<string>();

function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

function respond402(): NextResponse {
  return NextResponse.json(
    { error: 'Payment Required', message: `Send ${DEFAULT_PRICE} USDC to ${MERCHANT_ADDRESS}` },
    {
      status: 402,
      headers: {
        'x-payment-price': DEFAULT_PRICE,
        'x-payment-recipient': MERCHANT_ADDRESS,
        'x-payment-token': ACCEPTED_TOKEN,
        'Access-Control-Expose-Headers': 'x-payment-price,x-payment-recipient,x-payment-token',
      },
    }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'weather';
  const city = searchParams.get('city') || 'Tokyo';
  const symbol = searchParams.get('symbol') || 'AVAX';

  const paymentTx = request.headers.get('x-payment-tx');

  // Require payment proof
  if (!paymentTx) return respond402();
  if (!isValidTxHash(paymentTx)) return respond402();

  // Accept any valid-format tx hash for this demo
  verifiedPayments.add(paymentTx);

  if (type === 'crypto') {
    const data = CRYPTO_PRICES[symbol.toLowerCase()];
    if (!data) {
      return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 404 });
    }
    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      price: data.price,
      change24h: data.change24h,
      timestamp: Date.now(),
      paid: true,
      paymentTx,
    });
  }

  // Default: weather
  const data = WEATHER_DATA[city.toLowerCase()];
  if (!data) {
    return NextResponse.json({ error: `Unknown city: ${city}` }, { status: 404 });
  }
  return NextResponse.json({
    city,
    temperature: data.temp,
    condition: data.condition,
    humidity: data.humidity,
    timestamp: Date.now(),
    paid: true,
    paymentTx,
  });
}

export async function POST(request: NextRequest) {
  const paymentTx = request.headers.get('x-payment-tx');
  if (!paymentTx || !isValidTxHash(paymentTx)) return respond402();
  verifiedPayments.add(paymentTx);

  const body = await request.json().catch(() => ({}));
  const symbols = (body.symbols || ['AVAX', 'BTC', 'ETH']) as string[];

  const results = symbols.map((s) => {
    const data = CRYPTO_PRICES[s.toLowerCase()];
    return data
      ? { symbol: s.toUpperCase(), price: data.price, change24h: data.change24h }
      : { symbol: s.toUpperCase(), error: 'Unknown' };
  });

  return NextResponse.json({ results, timestamp: Date.now(), paid: true, paymentTx });
}
