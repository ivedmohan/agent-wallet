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
    estimatedGasCost?: string;
    actualGasCost?: string;
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
  { name: 'Tokyo' },
  { name: 'London' },
  { name: 'Dubai' },
  { name: 'New York' },
  { name: 'Singapore' },
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
  const [activeSection, setActiveSection] = useState<'demo' | 'code' | 'marketplace'>('demo');
  const [selectedCity, setSelectedCity] = useState('Tokyo');
  const [x402Enabled, setX402Enabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [requestPhase, setRequestPhase] = useState<'idle' | 'connecting' | 'quoting' | 'paying' | 'settling'>('idle');
  const [result, setResult] = useState<DemoResult | null>(null);
  const [paymentRequired, setPaymentRequired] = useState<PaymentRequiredData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ text: string; type: 'info' | 'success' | 'error' }>>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Marketplace state
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
  const [registerName, setRegisterName] = useState('');
  const [registerDesc, setRegisterDesc] = useState('');
  const [registerResult, setRegisterResult] = useState<string | null>(null);
  const [marketplaceBusy, setMarketplaceBusy] = useState(false);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => { if (activeSection === 'marketplace') fetchAgents(); }, [activeSection]);

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/marketplace');
      const data = await res.json();
      if (data.success) setAgents(data.agents);
    } catch { /* ignore */ }
  };

  const registerAgent = async () => {
    if (!registerName.trim()) return;
    setMarketplaceBusy(true);
    setRegisterResult(null);
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', name: registerName.trim(), description: registerDesc.trim() || `${registerName.trim()} — AI agent` }),
      });
      const data = await res.json();
      if (data.success) {
        setRegisterResult(`✅ Registered! Agent ID: ${data.agentId} · Tx: ${data.txHash?.slice(0, 18)}...`);
        setRegisterName(''); setRegisterDesc('');
        setTimeout(fetchAgents, 3000);
      } else {
        setRegisterResult(`❌ ${data.error || 'Registration failed'}`);
      }
    } catch (err: any) {
      setRegisterResult(`❌ ${err?.message || 'Error'}`);
    } finally { setMarketplaceBusy(false); }
  };

  const addLog = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs((prev) => [...prev, { text, type }]);
  };

  const requestButtonLabel =
    requestPhase === 'connecting' ? 'Checking merchant...' :
    requestPhase === 'quoting' ? 'Receiving 402...' :
    requestPhase === 'paying' ? 'Sending payment...' :
    requestPhase === 'settling' ? 'Settling fee...' :
    'Request Weather Data';

  const requestData = useCallback(async () => {
    setRunning(true);
    setRequestPhase('connecting');
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
          setRequestPhase('quoting');
          const price = res.headers.get('x-payment-price') || 'unknown';
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
      setRequestPhase('paying');
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
        setRequestPhase('settling');
        addLog(`───────────────────────────────────`, 'info');
        addLog(`💰 Total: $${data.payment.totalCost} USDC  │  API: $${data.payment.apiCost}  │  SmoothSend gas: $${data.payment.gasCost}`, 'success');
        if (data.payment.estimatedGasCost && data.payment.actualGasCost && data.payment.estimatedGasCost !== data.payment.actualGasCost) {
          addLog(`   Estimate: $${data.payment.estimatedGasCost}  →  Settled: $${data.payment.actualGasCost}`, 'info');
        }
        addLog(`🔗 TxHash: ${data.payment.txHash}`, 'info');
        addLog(`───────────────────────────────────`, 'info');
      }
    } catch (err: any) {
      const msg = err?.message || 'Request failed';
      setError(msg);
      addLog(`❌ ${msg}`, 'error');
      setRequestPhase('idle');
    } finally {
      setRunning(false);
      setRequestPhase('idle');
    }
  }, [x402Enabled, selectedCity]);

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
              <div className="text-2xl font-bold text-white">Live</div>
              <div className="text-xs text-white/30 mt-1">SDK Gas Quote</div>
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
          <button onClick={() => setActiveSection('marketplace')}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeSection === 'marketplace' ? 'border-violet-400 text-white' : 'border-transparent text-white/30 hover:text-white/50'
            }`}>
            Marketplace
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
                      ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10'
                      : x402Enabled
                        ? 'bg-violet-500 hover:bg-violet-400 text-white hover:shadow-lg hover:shadow-violet-500/20 active:scale-[0.98]'
                        : 'bg-white/10 hover:bg-white/15 text-white/80 hover:text-white active:scale-[0.98] border border-white/10'
                  }`}
                >
                  {running ? (
                    <span className="flex items-center gap-2">
                      <SpinnerIcon className="w-4 h-4" />
                      <span>{requestButtonLabel}</span>
                      <span className="flex items-center gap-1 translate-y-[1px]" aria-hidden="true">
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.2s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.1s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
                      </span>
                    </span>
                  ) : (
                    <><BoltIcon /> Request Weather Data</>
                  )}
                </button>
                {running && (
                  <div className="flex items-center justify-between text-[11px] text-white/35 font-mono pt-1">
                    <span className="uppercase tracking-[0.2em]">{requestPhase}</span>
                    <span className="animate-pulse">SmoothSend + x402</span>
                  </div>
                )}
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
                      <span className="text-white/40">Estimated gas</span>
                      <span className="font-mono text-white/60">${result.payment.estimatedGasCost ?? result.payment.gasCost} USDC</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/40">Actual settled fee</span>
                      <span className="font-mono text-white/60">${result.payment.actualGasCost ?? result.payment.gasCost} USDC</span>
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

        {activeSection === 'marketplace' && (
          <div className="space-y-6">
            {/* Register Agent Card */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Register Your Agent</h3>
                  <p className="text-xs text-white/40">Create an ERC-8004 identity on-chain</p>
                </div>
              </div>
              <div className="flex gap-3 mb-3">
                <input
                  value={registerName} onChange={(e) => setRegisterName(e.target.value)}
                  placeholder="Agent name"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                />
                <input
                  value={registerDesc} onChange={(e) => setRegisterDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                />
                <button
                  onClick={registerAgent} disabled={marketplaceBusy || !registerName.trim()}
                  className="px-4 py-2 bg-violet-500 hover:bg-violet-400 disabled:bg-white/5 disabled:text-white/30 text-white text-sm font-medium rounded-lg transition-all whitespace-nowrap"
                >
                  {marketplaceBusy ? 'Registering...' : 'Register'}
                </button>
              </div>
              {registerResult && (
                <div className={`text-xs font-mono mt-2 ${registerResult.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {registerResult}
                </div>
              )}
            </div>

            {/* Agent Cards Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.length === 0 && (
                <div className="md:col-span-2 lg:col-span-3 text-center py-12 text-white/20">
                  No agents found in the registry. Register one above!
                </div>
              )}
              {agents.map((agent: any) => (
                <button
                  key={agent.agentId}
                  onClick={() => setSelectedAgent(selectedAgent?.agentId === agent.agentId ? null : agent)}
                  className={`text-left bg-white/[0.02] border rounded-xl p-5 transition-all duration-200 hover:bg-white/[0.04] ${
                    selectedAgent?.agentId === agent.agentId ? 'border-violet-500/40' : 'border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{agent.name}</div>
                      <div className="text-[10px] font-mono text-white/20 mt-0.5">ID #{agent.agentId}</div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${
                      agent.reputation.score >= 50 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white/40'
                    }`}>
                      <span>{agent.reputation.count > 0 ? `${agent.reputation.score}/100` : '—'}</span>
                    </div>
                  </div>
                  {selectedAgent?.agentId === agent.agentId && (
                    <div className="mt-3 pt-3 border-t border-white/5 space-y-2 text-xs animate-fade-in">
                      <div className="flex justify-between text-white/30">
                        <span>Owner</span>
                        <span className="font-mono text-white/50">{agent.owner?.slice(0, 10)}...{agent.owner?.slice(-4)}</span>
                      </div>
                      <div className="flex justify-between text-white/30">
                        <span>Wallet</span>
                        <span className="font-mono text-white/50">{agent.agentWallet?.slice(0, 10)}...{agent.agentWallet?.slice(-4)}</span>
                      </div>
                      <div className="flex justify-between text-white/30">
                        <span>Reputation</span>
                        <span className="font-mono text-white/50">{agent.reputation.count} feedbacks · {agent.reputation.score}/100</span>
                      </div>
                      <button
                        onClick={async () => {
                          setMarketplaceBusy(true);
                          setRegisterResult(null);
                          try {
                            const res = await fetch('/api/demo', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'hire', agentId: agent.agentId, agentWallet: agent.agentWallet }),
                            });
                            const data = await res.json();
                            if (data.success) {
                              setRegisterResult(`✅ Hired! Tx: ${data.txHash?.slice(0, 18)}... · Feedback submitted`);
                              setTimeout(fetchAgents, 2000);
                            } else {
                              setRegisterResult(`❌ ${data.error || 'Hire failed'}`);
                            }
                          } catch (err: any) {
                            setRegisterResult(`❌ ${err?.message || 'Error'}`);
                          } finally { setMarketplaceBusy(false); }
                        }}
                        disabled={marketplaceBusy}
                        className="w-full mt-2 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/5 disabled:text-white/30 text-white text-xs font-medium rounded-lg transition-all"
                      >
                        {marketplaceBusy ? 'Processing...' : 'Hire Agent (x402)'}
                      </button>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Agent Detail (expanded) */}
            {selectedAgent && (
              <div className="bg-emerald-500/[0.02] border border-emerald-500/20 rounded-xl p-5 animate-fade-in">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-lg">🤖</div>
                  <div>
                    <div className="text-base font-semibold text-white">{selectedAgent.name}</div>
                    <div className="text-xs text-white/40">Agent ID #{selectedAgent.agentId} · ERC-8004</div>
                  </div>
                </div>
                <p className="text-sm text-white/50 mb-4">
                  Registered on <span className="text-white/70">Avalanche Fuji</span> with x402 payment support.
                  Reputation is tracked via the on-chain <span className="text-white/70">ReputationRegistry</span>.
                </p>
                <div className="grid grid-cols-3 gap-3 text-center mb-4">
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-lg font-bold text-emerald-400">{selectedAgent.reputation.score}</div>
                    <div className="text-[10px] text-white/30">Reputation Score</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-lg font-bold text-white">{selectedAgent.reputation.count}</div>
                    <div className="text-[10px] text-white/30">Feedbacks</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-lg font-bold text-cyan-400">x402</div>
                    <div className="text-[10px] text-white/30">Payment Protocol</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`https://testnet.snowtrace.io/address/${selectedAgent.agentWallet}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium rounded-lg text-center transition-all"
                  >
                    View on Snowtrace
                  </a>
                </div>
              </div>
            )}
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

console.log(\`\${weather.data.temperature}°C, \${weather.data.condition}\`);
console.log(\`API: $\${weather.payment.apiCost} · Estimated gas: $\${weather.payment.estimatedGasCost}\`);
console.log(\`Settled fee: $\${weather.payment.actualGasCost}\`);
// Estimate is quoted first, then settled fee is captured after the tx lands.`}
            </pre>
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="text-xs text-white/20">
            <a href="https://github.com/vedmohan/agent-wallet" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white/60 transition-colors">GitHub</a>
            &nbsp;·&nbsp; Avalanche Fuji
          </div>
          <div className="flex items-center gap-4">
            <a href="https://www.npmjs.com/package/@vedmohan/agent-wallet" target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-white/25 hover:text-white/50 transition-colors font-mono">
              SDK v2.0.3
            </a>
            <a href="https://smoothsend.xyz" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 text-sm md:text-base font-semibold text-white/45 hover:text-white/80 transition-all group">
              <svg width="30" height="34" viewBox="0 0 140 162" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-55 group-hover:opacity-85 transition-opacity">
                <path d="M104.738 67.8756C107.331 68.5157 109.524 70.1513 110.832 72.4175C116.719 82.6134 122.266 92.2219 127.729 101.684C138.717 120.716 120.282 144.066 98.5128 138.692L51.0942 126.984C48.9172 126.447 48.5803 123.574 50.5602 122.43L75.6752 107.93C76.7939 107.284 78.1193 107.097 79.3735 107.406L82.8988 108.277C87.2526 109.351 90.9396 104.681 88.742 100.875L69.7345 67.9528C67.5309 64.1362 70.9845 59.5423 75.2631 60.5986L104.738 67.8756Z" fill="currentColor"/>
                <path d="M34.5435 93.368C31.9513 92.7282 29.7583 91.0925 28.4499 88.8263C22.5633 78.6304 17.0158 69.0219 11.5527 59.5595C0.565034 40.5279 19 17.1777 40.7694 22.5522L88.1879 34.2594C90.3648 34.7967 90.7017 37.6702 88.7219 38.8133L63.6073 53.3134C62.4885 53.9593 61.1631 54.1472 59.9089 53.8376L56.3833 52.9672C52.0294 51.8924 48.3425 56.5625 50.5401 60.3688L69.5479 93.2909C71.7514 97.1075 68.2979 101.702 64.0193 100.645L34.5435 93.368Z" fill="currentColor"/>
              </svg>
              <span className="group-hover:bg-gradient-to-r group-hover:from-violet-400 group-hover:to-cyan-400 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                Powered by SmoothSend
              </span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
