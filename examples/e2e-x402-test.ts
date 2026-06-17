#!/usr/bin/env tsx
import 'dotenv/config';
import { AgentWallet, X402Client } from '../src/index.js';

const SMOOTHSEND_API_KEY = process.env.SMOOTHSEND_API_KEY;
const X402_API_URL = process.env.X402_API_URL || 'http://localhost:3030';
const NETWORK = (process.env.NETWORK || 'avalanche-fuji') as 'avalanche-fuji' | 'avalanche-mainnet';

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Agent Wallet SDK — x402 E2E Test');
  console.log('═══════════════════════════════════════════════\n');

  if (!SMOOTHSEND_API_KEY) { console.error('❌ Missing SMOOTHSEND_API_KEY'); process.exit(1); }

  console.log('📦 Creating AgentWallet...');
  const wallet = await AgentWallet.create({
    smoothSendApiKey: SMOOTHSEND_API_KEY, dailyLimit: '100', perTxLimit: '10',
    network: NETWORK, privateKey: process.env.PRIVATE_KEY,
  });
  console.log(`   🏦 Smart Account: ${wallet.address}`);
  console.log(`💰 Balance: $${await wallet.getBalance()} USDC\n`);

  const x402 = new X402Client({ wallet });

  console.log('🌤️  Fetching weather (auto-pay via x402)...');
  try {
    const weather = await x402.request(`${X402_API_URL}/weather?city=Tokyo`);
    console.log(`   Status: ${weather.status} | Paid: ${weather.paid}`);
    if (weather.payment) console.log(`   Cost: $${weather.payment.totalCost} USDC (incl. gas)`);
    console.log(`   Data: ${JSON.stringify(weather.data)}\n`);
  } catch (err) {
    console.error(`   ❌ Failed: ${(err as Error).message}`);
  }
}

main().catch(console.error);
