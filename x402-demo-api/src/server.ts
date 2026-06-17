import express from 'express';
import cors from 'cors';

const PORT = parseInt(process.env.PORT || '3030', 10);
const MERCHANT = process.env.X402_MERCHANT || '0x0000000000000000000000000000000000000001';
const PRICE = process.env.X402_PRICE || '0.25';

const WEATHER: Record<string, any> = {
  tokyo: { temp: 25, condition: 'sunny', humidity: 55 },
  london: { temp: 14, condition: 'cloudy', humidity: 72 },
  nyc: { temp: 22, condition: 'partly cloudy', humidity: 60 },
};
const CRYPTO: Record<string, any> = {
  AVAX: { price: 30.42, change24h: '+3.2%' },
  BTC: { price: 68450, change24h: '+1.8%' },
  ETH: { price: 3520, change24h: '+2.1%' },
};

function x402Middleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const tx = req.headers['x-payment-tx'] as string | undefined;
  if (tx) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(tx)) {
      res.setHeader('x-payment-price', PRICE);
      res.setHeader('x-payment-recipient', MERCHANT);
      return res.status(402).json({ error: 'Invalid tx hash' });
    }
    return next();
  }
  res.setHeader('x-payment-price', PRICE);
  res.setHeader('x-payment-recipient', MERCHANT);
  res.status(402).json({ error: 'Payment required', payment: { amount: PRICE, to: MERCHANT, token: 'USDC' } });
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', protocol: 'x402', price: PRICE, merchant: MERCHANT }));

app.get('/weather', x402Middleware, (req, res) => {
  const city = (req.query.city as string || '').toLowerCase();
  res.json({ city: city || 'unknown', ...(WEATHER[city] || { temp: 20, condition: 'clear', humidity: 50 }), unit: 'celsius', paid: true });
});

app.get('/crypto/:symbol', x402Middleware, (req, res) => {
  const data = CRYPTO[req.params.symbol.toUpperCase()];
  if (!data) return res.status(404).json({ error: 'Unknown symbol' });
  res.json({ symbol: req.params.symbol.toUpperCase(), ...data, currency: 'USD', paid: true });
});

app.listen(PORT, () => {
  console.log(`\n🚀 x402 Demo API @ http://localhost:${PORT}`);
  console.log(`   Price: $${PRICE} | Merchant: ${MERCHANT}`);
});
