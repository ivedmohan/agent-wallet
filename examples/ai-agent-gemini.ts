#!/usr/bin/env tsx
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentWallet, X402Client } from '../src/index.js';

async function main() {
  const SMOOTHSEND_API_KEY = process.env.SMOOTHSEND_API_KEY;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const X402_API_URL = process.env.X402_API_URL || 'http://localhost:3030';
  const NETWORK = (process.env.NETWORK || 'avalanche-fuji') as any;

  if (!SMOOTHSEND_API_KEY || !GEMINI_API_KEY) {
    console.error('Missing SMOOTHSEND_API_KEY or GEMINI_API_KEY'); process.exit(1);
  }

  const wallet = await AgentWallet.create({
    smoothSendApiKey: SMOOTHSEND_API_KEY, dailyLimit: '10', perTxLimit: '1',
    network: NETWORK,
  });
  const x402 = new X402Client({ wallet });
  console.log(`💰 Balance: $${await wallet.getBalance()} USDC`);

  const tools = {
    getBalance: async () => `Balance: $${await wallet.getBalance()} USDC`,
    getWeather: async (city: string) => {
      const r = await x402.request({ url: `${X402_API_URL}/weather?city=${city}`, method: 'GET' });
      if (r.payment) console.log(`   Cost: $${r.payment.totalCost}`);
      return JSON.stringify(r.data);
    },
    getCryptoPrice: async (symbol: string) => {
      const r = await x402.request({ url: `${X402_API_URL}/crypto/${symbol}`, method: 'GET' });
      if (r.payment) console.log(`   Cost: $${r.payment.totalCost}`);
      return JSON.stringify(r.data);
    },
  };

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }, { apiVersion: 'v1beta' });
  const chat = model.startChat({
    history: [{ role: 'user', parts: [{ text: `You have a wallet on Avalanche. You can pay for APIs with USDC.` }] }],
    tools: [{
      functionDeclarations: [
        { name: 'getBalance', description: 'Check USDC balance', parameters: { type: 'object', properties: {} } },
        { name: 'getWeather', description: 'Get weather for a city. Costs ~$0.28 USDC.', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } },
        { name: 'getCryptoPrice', description: 'Get crypto price. Costs ~$0.28 USDC.', parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
      ],
    }],
  });

  const rl = (await import('node:readline')).default.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n🤖 AI Agent ready! Ask me anything.');
  const ask = () => rl.question('You: ', async (input) => {
    if (input === 'quit') { rl.close(); return; }
    const result = await chat.sendMessage(input);
    for (const part of result.response.candidates?.[0]?.content?.parts || []) {
      if (part.functionCall) {
        const fn = tools[part.functionCall.name as keyof typeof tools] as Function;
        const args = (part.functionCall.args || {}) as Record<string, string>;
        const output = await fn(...Object.values(args));
        const r2 = await chat.sendMessage([{ text: `Result: ${output}` }]);
        console.log(`\n🤖 Agent: ${r2.response.text()}\n`);
      } else if (part.text) {
        console.log(`\n🤖 Agent: ${part.text}\n`);
      }
    }
    ask();
  });
  ask();
}

main().catch(console.error);
