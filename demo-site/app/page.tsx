'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ───────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface FlowStep {
  step: number;
  label: string;
  detail: string;
  status: StepStatus;
  duration?: number;
}

interface DemoResult {
  success: boolean;
  duration: number;
  steps: FlowStep[];
  result?: { weather?: any };
  payment?: {
    txHash: string;
    totalCost: string;
    gasCost: string;
    apiCost: string;
    remainingBudget: string;
  };
  wallet?: { address: string; eoa: string; balance: string; budget: any };
  network?: string;
  error?: string;
}

interface PaymentRequiredData {
  price: string;
  recipient: string;
  token: string;
}

const CITIES = [
  { name: 'Tokyo', temp: 25, condition: 'sunny', humidity: 45 },
  { name: 'London', temp: 14, condition: 'cloudy', humidity: 72 },
  { name: 'Dubai', temp: 38, condition: 'clear', humidity: 20 },
  { name: 'New York', temp: 22, condition: 'partly cloudy', humidity: 55 },
  { name: 'Singapore', temp: 30, condition: 'thunderstorms', humidity: 85 },
];

// ── Icons ───────────────────────────────────────────────────────

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4 text-emerald-400'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4 text-violet-400 animate-spin'} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

// ── Tx Link ─────────────────────────────────────────────────────

function TxLink({ txHash, network }: { txHash: string; network?: string }) {
  const base = network?.includes('mainnet') ? 'https://snowtrace.io/tx/' : 'https://testnet.snowtrace.io/tx/';
  return (
    <a href={`${base}${txHash}`} target="_blank" rel="noopener noreferrer"
       className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors font-mono text-xs break-all">
      {txHash}
    </a>
  );
}

// ── Toggle Switch ───────────────────────────────────────────────

function Toggle({ enabled, onChange, label }: { enabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full shrink-0 transition-colors duration-300 ${
        enabled ? 'bg-violet-500' : 'bg-white/10'
      }`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${
        enabled ? 'translate-x-6' : 'translate-x-1'
      }`} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function DemoPage() {
  const [activeSection, setActiveSection] = useState<'demo' | 'code'>('demo');
  const [selectedCity, setSelectedCity] = useState('Tokyo');
  const [x402Enabled, setX402Enabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [paymentRequired, setPaymentRequired] = useState<PaymentRequiredData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ text: string; type: 'info' | 'success' | 'error' }>>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const addLog = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs((prev) => [...prev, { text, type }]);
  };

  const requestData = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setPaymentRequired(null);
    setError(null);
    setLogs([]);

    if (!x402Enabled) {
      // x402 OFF: direct merchant request, expect 402
      addLog(`🌐 GET /api/merchant?type=weather&city=${selectedCity}`, 'info');
      try {
        const res = await fetch(`/api/merchant?type=weather&city=${selectedCity}`);
        if (res.status === 402) {
          const price = res.headers.get('x-payment-price') || '0.01';
          const recipient = res.headers.get('x-payment-recipient') || '';
          const token = res.headers.get('x-payment-token') || 'USDC';
          setPaymentRequired({ price, recipient, token });
          addLog('⚡ 402 Payment Required', 'error');
          addLog(`   Price: $${price} ${token}`, 'error');
          addLog(`   Recipient: ${recipient.slice(0, 10)}...${recipient.slice(-4)}`, 'info');
          addLog('', 'info');
          addLog('💡 Enable x402 Auto-Pay above to pay & get data', 'info');
        } else {
          const data = await res.json();
          setResult({ success: true, duration: 0, steps: [{ step: 1, label: 'Data Received', detail: `${data.city}: ${data.temperature}°C, ${data.condition}`, status: 'done' }] });
          addLog(`✅ ${data.city}: ${data.temperature}°C, ${data.condition}`, 'success');
        }
      } catch (err: any) {
        const msg = err?.message || 'Request failed';
        setError(msg);
        addLog(`❌ ${msg}`, 'error');
      } finally {
        setRunning(false);
      }
      return;
    }

    // x402 ON: run the full demo flow
    addLog('🤖 Initializing Agent Wallet...', 'info');
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: selectedCity }),
      });
      const data: DemoResult = await res.json();
      setResult(data);

      for (const step of data.steps) {
        await new Promise((r) => setTimeout(r, 350));
        if (step.status === 'done') addLog(`✅ ${step.label} — ${step.detail}`, 'success');
        else if (step.status === 'error') addLog(`❌ ${step.label} — ${step.detail}`, 'error');
        else addLog(`⏳ ${step.label}...`, 'info');
      }

      if (data.success && data.payment) {
        addLog(`───────────────────────────────────`, 'info');
        addLog(`💰 Total: $${data.payment.totalCost} USDC  │  API: $${data.payment.apiCost}  │  Gas: $${data.payment.gasCost}`, 'success');
        addLog(`🔗 TxHash: ${data.payment.txHash}`, 'info');
        addLog(`───────────────────────────────────`, 'info');
      }
    } catch (err: any) {
      const msg = err?.message || 'Request failed';
      setError(msg);
      addLog(`❌ ${msg}`, 'error');
    } finally {
      setRunning(false);
    }
  }, [x402Enabled, selectedCity]);

  const cityData = CITIES.find(c => c.name === selectedCity);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* ── Hero ── */}
      <header className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-20 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
            <span className="text-white">x402 + </span>
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Agent Wallet</span>
          </h1>
          <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
            AI agents pay for APIs in <span className="text-white font-medium">USDC</span> — including gas.
            No AVAX needed. No merchant subsidies. Zero setup.
          </p>

          <div className="flex justify-center gap-8 md:gap-16 mt-10 text-center">
            <div>
              <div className="text-2xl font-bold text-white">100%</div>
              <div className="text-xs text-white/30 mt-1">Merchant Revenue</div>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <div className="text-2xl font-bold text-white">$0.02</div>
              <div className="text-xs text-white/30 mt-1">Avg Tx Cost (USDC)</div>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <div className="text-2xl font-bold text-emerald-400">0</div>
              <div className="text-xs text-white/30 mt-1">AVAX Needed</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Comparison ── */}
      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-mono text-red-400/60 bg-red-400/10 px-2 py-0.5 rounded">Base x402</span>
            </div>
            <div className="space-y-3 text-sm text-white/40">
              <div className="flex justify-between"><span>Merchant receives</span><span className="text-white/60">96%</span></div>
              <div className="flex justify-between"><span>Gas paid by</span><span className="text-red-400/80">Merchant (ETH)</span></div>
              <div className="flex justify-between"><span>Setup</span><span className="text-white/60">Deploy paymaster</span></div>
              <div className="flex justify-between"><span>Onboarding</span><span className="text-white/60">KYC + account</span></div>
            </div>
          </div>
          <div className="bg-violet-500/[0.03] border border-violet-500/20 rounded-xl p-6 relative">
            <div className="absolute -top-2.5 right-4">
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">Agent Wallet</span>
            </div>
            <div className="space-y-3 text-sm mt-2">
              <div className="flex justify-between"><span className="text-white/40">Merchant receives</span><span className="text-emerald-400 font-semibold">100%</span></div>
              <div className="flex justify-between"><span className="text-white/40">Gas paid by</span><span className="text-white font-medium">Agent (USDC)</span></div>
              <div className="flex justify-between"><span className="text-white/40">Setup</span><span className="text-white font-medium">Zero — SmoothSend handles it</span></div>
              <div className="flex justify-between"><span className="text-white/40">Onboarding</span><span className="text-white font-medium">1 API key, 30 seconds</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Demo ── */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="flex gap-1 border-b border-white/5 mb-8">
          <button onClick={() => setActiveSection('demo')}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeSection === 'demo' ? 'border-violet-400 text-white' : 'border-transparent text-white/30 hover:text-white/50'
            }`}>
            Live Demo
          </button>
          <button onClick={() => setActiveSection('code')}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeSection === 'code' ? 'border-violet-400 text-white' : 'border-transparent text-white/30 hover:text-white/50'
            }`}>
            Quick Start
          </button>
        </div>

        {activeSection === 'demo' && (
          <div className="grid md:grid-cols-5 gap-6">
            {/* Left: Controls + Result (3 cols) */}
            <div className="md:col-span-3 space-y-4">

              {/* Controls Card */}
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 space-y-5">
                {/* City Selector */}
                <div>
                  <label className="block text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">City</label>
                  <div className="flex gap-2 flex-wrap">
                    {CITIES.map((city) => (
                      <button
                        key={city.name}
                        onClick={() => { setSelectedCity(city.name); setResult(null); setPaymentRequired(null); }}
                        className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          selectedCity === city.name
                            ? 'bg-white/10 text-white border border-white/20'
                            : 'bg-white/[0.03] text-white/40 border border-transparent hover:text-white/60 hover:bg-white/[0.06]'
                        }`}
                      >
                        {city.name}
                        <span className="ml-1.5 text-xs opacity-60">{city.temp}°C</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* x402 Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium text-white/80">x402 Auto-Pay</div>
                    <div className="text-xs text-white/30 mt-0.5">
                      {x402Enabled
                        ? 'Automatically pays the merchant via SmoothSend'
                        : 'See the 402 Payment Required error first'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono transition-colors ${x402Enabled ? 'text-violet-400' : 'text-white/20'}`}>
                      {x402Enabled ? 'ON' : 'OFF'}
                    </span>
                    <Toggle enabled={x402Enabled} onChange={setX402Enabled} label="Toggle x402" />
                  </div>
                </div>

                {/* Request Button */}
                <button
                  onClick={requestData}
                  disabled={running}
                  className={`w-full py-3.5 px-6 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                    running
                      ? 'bg-white/5 text-white/30 cursor-not-allowed'
                      : x402Enabled
                        ? 'bg-violet-500 hover:bg-violet-400 text-white hover:shadow-lg hover:shadow-violet-500/20 active:scale-[0.98]'
                        : 'bg-white/10 hover:bg-white/15 text-white/80 hover:text-white active:scale-[0.98] border border-white/10'
                  }`}
                >
                  {running ? (
                    <><SpinnerIcon className="w-4 h-4" /> Processing...</>
                  ) : (
                    <><BoltIcon /> Request Weather Data</>
                  )}
                </button>
              </div>

              {/* 402 Error Display (x402 OFF) */}
              {paymentRequired && !x402Enabled && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-6 animate-fade-in">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                      <span className="text-2xl">⚡</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-amber-300 mb-1">402 Payment Required</h3>
                      <p className="text-sm text-white/50 mb-3">
                        This API endpoint requires <span className="text-white font-medium">${paymentRequired.price} USDC</span> before returning data.
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs">
                        <div className="bg-white/5 px-3 py-1.5 rounded-lg">
                          <span className="text-white/30">Price</span>
                          <span className="ml-2 text-white font-mono">${paymentRequired.price} {paymentRequired.token}</span>
                        </div>
                        <div className="bg-white/5 px-3 py-1.5 rounded-lg">
                          <span className="text-white/30">To</span>
                          <span className="ml-2 text-white/60 font-mono">{paymentRequired.recipient.slice(0, 8)}...{paymentRequired.recipient.slice(-4)}</span>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-amber-500/10">
                        <p className="text-xs text-amber-400/60">
                          💡 Toggle <span className="text-white font-mono">x402 Auto-Pay</span> ON and request again to auto-pay and get the data.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Result Card (x402 ON, done) */}
              {result?.success && result?.result?.weather && x402Enabled && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 animate-fade-in">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 text-2xl">
                      🌤
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-emerald-300 mb-1">
                        {result.result.weather.city || selectedCity}
                      </h3>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-3xl font-bold text-white">{result.result.weather.temperature}°C</span>
                        <span className="text-sm text-white/50 capitalize">{result.result.weather.condition}</span>
                      </div>
                      <div className="text-xs text-white/30">Humidity: {result.result.weather.humidity}%</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-sm text-red-300 animate-fade-in">
                  {error}
                </div>
              )}
            </div>

            {/* Right: Terminal + Details (2 cols) */}
            <div className="md:col-span-2 space-y-4">

              {/* Terminal */}
              <div className="bg-black/40 border border-white/[0.06] rounded-xl overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/50" />
                  <span className="text-[10px] text-white/20 font-mono ml-2">terminal — x402-demo</span>
                </div>
                <div className="p-4 font-mono text-xs max-h-80 overflow-y-auto space-y-1.5 min-h-[220px]">
                  {logs.length === 0 && !running && (
                    <div className="text-white/15 italic">
                      {x402Enabled
                        ? 'Click "Request Weather Data" to run the x402 auto-pay flow...'
                        : 'Click "Request Weather Data" to see the 402 Payment Required error...'}
                    </div>
                  )}
                  {logs.map((log, i) => (
                    <div key={i} className={`flex gap-2 animate-fade-in ${
                      log.type === 'success' ? 'text-emerald-300' :
                      log.type === 'error' ? 'text-red-300' : 'text-white/50'
                    }`}>
                      <span className="text-white/20 select-none shrink-0">$</span>
                      <span className="whitespace-pre-wrap">{log.text}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>

              {/* Transaction Info (shown after successful x402) */}
              {result?.payment && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 animate-fade-in space-y-3">
                  <h3 className="text-xs font-semibold text-white/30 uppercase tracking-widest">Cost Breakdown</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-white/40">API Fee</span>
                      <span className="font-mono text-white/80">${result.payment.apiCost} USDC</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/40">Gas (min. floor)</span>
                      <span className="font-mono text-white/60">${result.payment.gasCost} USDC</span>
                    </div>
                    <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                      <span className="text-xs font-semibold text-white/50">Total</span>
                      <span className="font-semibold text-emerald-400">${result.payment.totalCost} USDC</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/5">
                    <div className="text-white/30 text-xs mb-1">Transaction</div>
                    <TxLink txHash={result.payment.txHash} network={result.network} />
                  </div>
                </div>
              )}

              {/* Wallet info */}
              {result?.wallet && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 text-xs animate-fade-in">
                  <div className="text-white/30 font-mono mb-1">
                    Smart Account: <span className="text-white/60">{result.wallet.address.slice(0, 10)}...{result.wallet.address.slice(-4)}</span>
                  </div>
                  <div className="text-white/30 font-mono mb-1">
                    EOA: <span className="text-white/40">{result.wallet.eoa.slice(0, 10)}...{result.wallet.eoa.slice(-4)}</span>
                  </div>
                  <div className="text-white/30 font-mono">
                    Balance: <span className="text-emerald-400">${parseFloat(result.wallet.balance).toFixed(2)} USDC</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'code' && (
          <div className="bg-black/40 border border-white/[0.06] rounded-xl overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/50" />
              <span className="text-[10px] text-white/20 font-mono ml-2">app.ts</span>
            </div>
            <pre className="p-5 text-sm font-mono text-white/70 overflow-x-auto leading-relaxed">
{`import { AgentWallet, X402Client } from '@vedmohan/agent-wallet';

const wallet = await AgentWallet.create({
  smoothSendApiKey: process.env.SMOOTHSEND_API_KEY,
  dailyLimit: '100',
  perTxLimit: '10',
  network: 'avalanche-fuji',
});

console.log(\`Smart Account: \${wallet.address}\`);
console.log(\`Balance: $\${await wallet.getBalance()} USDC\`);

const x402 = new X402Client({ wallet });

// Auto-pays if 402 is received
const weather = await x402.request(
  'https://api.example.com/weather?city=Tokyo'
);

console.log(\`\${weather.data.temp}°C, \${weather.data.condition}\`);
// 💸 Auto-paid $0.02 USDC — all in USDC
//    API: $0.01  ·  Gas: $0.01 (min. floor)`}
            </pre>
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8 text-center text-xs text-white/20">
        Built on{' '}
        <a href="https://smoothsend.xyz" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white/60 transition-colors">SmoothSend</a>
        {' '}ERC-4337 infrastructure ·{' '}
        <a href="https://github.com/vedmohan/agent-wallet" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white/60 transition-colors">GitHub</a>
        {' '}· Avalanche Fuji
      </footer>
    </div>
  );
}
