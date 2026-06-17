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
  result?: { weather?: any; crypto?: any };
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

// ── Icons ───────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 text-violet-400 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ErrorIcon() {
  return <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v7M5 7l3 4 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

// ── Main Component ──────────────────────────────────────────────

export default function DemoPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ text: string; type: 'info' | 'success' | 'error' }>>([]);
  const [activeSection, setActiveSection] = useState<'demo' | 'code'>('demo');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const addLog = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs((prev) => [...prev, { text, type }]);
  };

  const runDemo = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    setLogs([]);
    addLog('Initializing Agent Wallet...', 'info');
    try {
      const res = await fetch('/api/demo', { method: 'POST' });
      const data: DemoResult = await res.json();
      setResult(data);
      for (const step of data.steps) {
        await new Promise((r) => setTimeout(r, 350));
        if (step.status === 'done') addLog(`✅ ${step.label} — ${step.detail}`, 'success');
        else if (step.status === 'error') addLog(`❌ ${step.label} — ${step.detail}`, 'error');
        else addLog(`⏳ ${step.label}...`, 'info');
      }
      if (data.success && data.payment) {
        addLog(`────────────────────────────────`, 'info');
        addLog(`💰 Total: $${data.payment.totalCost} USDC  │  API: $${data.payment.apiCost}  │  Gas: $${data.payment.gasCost}`, 'success');
        addLog(`🔗 TxHash: ${data.payment.txHash}`, 'info');
        addLog(`────────────────────────────────`, 'info');
      }
    } catch (err: any) {
      const msg = err?.message || 'Request failed';
      setError(msg);
      addLog(`❌ ${msg}`, 'error');
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* ── Hero ── */}
      <header className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/40 text-xs font-mono mb-6">
            Avalanche Hackathon 2026
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
            <span className="text-white">x402 + </span>
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Agent Wallet</span>
          </h1>
          <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
            AI agents pay for APIs in <span className="text-white font-medium">USDC</span> — including gas.
            No AVAX needed. No merchant subsidies. Zero setup.
          </p>

          {/* Hero stats */}
          <div className="flex justify-center gap-8 md:gap-16 mt-10 text-center">
            <div>
              <div className="text-2xl font-bold text-white">100%</div>
              <div className="text-xs text-white/30 mt-1">Merchant Revenue</div>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <div className="text-2xl font-bold text-white">$0.28</div>
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
      <section className="max-w-4xl mx-auto px-6 py-16">
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

      {/* ── Tab Switcher ── */}
      <section className="max-w-5xl mx-auto px-6 pb-8">
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
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: Flow visualization */}
            <div className="space-y-4">
              {/* Flow diagram */}
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 space-y-2">
                <h3 className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">Protocol Flow</h3>
                <FlowStepRow icon="🤖" label="Agent Wallet" sub="Smart account with $USDC" done={!!result} running={running && !result} />
                <FlowArrow />
                <FlowStepRow icon="🌐" label="x402 Request" sub="GET /weather?city=Tokyo" done={!!result?.steps?.find(s => s.status === 'done' && s.label.includes('x402'))} running={!!result?.steps?.find(s => s.status === 'running' && s.label.includes('x402'))} />
                <FlowArrow />
                <FlowStepRow icon="⚡" label="402 Payment Required" sub="$0.25 USDC" done={!!result?.steps?.find(s => s.status === 'done' && s.label.includes('402'))} running={!!result?.steps?.find(s => s.status === 'running' && s.label.includes('402'))} />
                <FlowArrow />
                <FlowStepRow icon="💸" label="Auto-Pay via SmoothSend" sub="user-pays-erc20 mode" done={!!result?.payment} running={!!result?.steps?.find(s => s.status === 'running' && s.label.includes('Payment'))} />
                <FlowArrow />
                <FlowStepRow icon="✅" label="Data Received" sub={result?.result?.weather ? `${result.result.weather.temperature}°C, ${result.result.weather.condition}` : 'Tokyo: 25°C, sunny'} done={!!result?.result} running={false} />
              </div>

              {/* On-chain data */}
              {result?.payment && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 animate-fade-in">
                  <h3 className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">Transaction</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-white/30">Cost</span><span className="font-medium text-emerald-400">${result.payment.totalCost} USDC</span></div>
                    <div className="flex justify-between"><span className="text-white/30">Gas</span><span className="font-mono text-white/60">${result.payment.gasCost} USDC</span></div>
                    <div className="flex justify-between"><span className="text-white/30">API</span><span className="font-mono text-white/60">${result.payment.apiCost} USDC</span></div>
                    <div className="pt-2 border-t border-white/5">
                      <div className="text-white/30 text-xs mb-1">Tx Hash</div>
                      <TxLink txHash={result.payment.txHash} network={result.network} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Terminal + Button */}
            <div className="space-y-4">
              <button
                onClick={runDemo}
                disabled={running}
                className={`w-full py-3.5 px-6 rounded-xl font-semibold text-sm transition-all duration-300 ${
                  running
                    ? 'bg-white/5 text-white/30 cursor-not-allowed'
                    : 'bg-white hover:bg-white/90 text-black hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]'
                }`}
              >
                {running ? (
                  <span className="flex items-center justify-center gap-2">
                    <SpinnerIcon /> Running Demo...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">▶ Run x402 Demo</span>
                )}
              </button>

              {/* Terminal */}
              <div className="bg-black/40 border border-white/[0.06] rounded-xl overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/50" />
                  <span className="text-[10px] text-white/20 font-mono ml-2">terminal — x402-demo</span>
                </div>
                <div className="p-4 font-mono text-xs max-h-72 overflow-y-auto space-y-1.5 min-h-[200px]">
                  {logs.length === 0 && !running && (
                    <div className="text-white/15 italic">Click "Run x402 Demo" to start the flow...</div>
                  )}
                  {logs.map((log, i) => (
                    <div key={i} className={`flex gap-2 animate-fade-in ${
                      log.type === 'success' ? 'text-emerald-300' :
                      log.type === 'error' ? 'text-red-300' : 'text-white/50'
                    }`}>
                      <span className="text-white/20 select-none">$</span>
                      <span>{log.text}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>

              {/* Wallet info */}
              {result?.wallet && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 text-xs animate-fade-in">
                  <div className="text-white/30 font-mono mb-1">Smart Account: <span className="text-white/60">{result.wallet.address}</span></div>
                  <div className="text-white/30 font-mono mb-1">EOA: <span className="text-white/40">{result.wallet.eoa}</span></div>
                  <div className="text-white/30 font-mono">Balance: <span className="text-emerald-400">${parseFloat(result.wallet.balance).toFixed(2)} USDC</span></div>
                </div>
              )}

              {error && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-sm text-red-300 animate-fade-in">
                  {error}
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
// 💸 Auto-paid $0.28 USDC — all in USDC
//    API: $0.25  ·  Gas: $0.03`}
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

// ── Helper Components ───────────────────────────────────────────

function FlowStepRow({ icon, label, sub, done, running }: { icon: string; label: string; sub: string; done: boolean; running: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-500 ${
      running ? 'bg-violet-500/10 border border-violet-500/20' :
      done ? 'bg-emerald-500/5 border border-emerald-500/10' :
      'border border-transparent'
    }`}>
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${done ? 'text-white/80' : running ? 'text-white' : 'text-white/30'}`}>
          {label}
        </div>
        <div className="text-xs text-white/30 truncate">{sub}</div>
      </div>
      {done && <CheckIcon />}
      {running && <SpinnerIcon />}
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex justify-center py-0.5">
      <ArrowIcon />
    </div>
  );
}
