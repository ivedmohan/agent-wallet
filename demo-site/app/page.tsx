'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────

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
  result?: {
    weather: any;
    crypto: any;
  };
  payment?: {
    txHash: string;
    totalCost: string;
    gasCost: string;
    apiCost: string;
    remainingBudget: string;
  };
  wallet?: {
    address: string;
    eoa: string;
    balance: string;
    budget: any;
  };
  network?: string;
  error?: string;
}

// ── Icons ───────────────────────────────────────────────────────────

function IconCheck() {
  return (
    <svg className="w-5 h-5 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
function IconSpinner() {
  return (
    <svg className="w-5 h-5 text-accent-purple animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
function IconError() {
  return (
    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function IconPending() {
  return <div className="w-5 h-5 rounded-full border-2 border-white/20" />;
}

// ── Step Status Badge ──────────────────────────────────────────────

function StepBadge({ status }: { status: StepStatus }) {
  if (status === 'done') return <IconCheck />;
  if (status === 'running') return <IconSpinner />;
  if (status === 'error') return <IconError />;
  return <IconPending />;
}

// ── Terminal Log Line ──────────────────────────────────────────────

function LogLine({ text, type }: { text: string; type: 'info' | 'success' | 'error' | 'warn' }) {
  const colors: Record<string, string> = {
    info: 'text-gray-400',
    success: 'text-accent-green',
    error: 'text-red-400',
    warn: 'text-yellow-400',
  };
  return (
    <div className="terminal-line animate-fade-in">
      <span className={colors[type]}>{text}</span>
    </div>
  );
}

// ── Snowtrace Link ─────────────────────────────────────────────────

function TxLink({ txHash, network }: { txHash: string; network?: string }) {
  const base = network?.includes('mainnet')
    ? 'https://snowtrace.io/tx/'
    : 'https://testnet.snowtrace.io/tx/';
  return (
    <a
      href={`${base}${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-cyan hover:text-accent-cyan/80 underline underline-offset-2 transition-colors font-mono text-sm"
    >
      {txHash.slice(0, 10)}...{txHash.slice(-6)} ↗
    </a>
  );
}

// ── Flow Diagram Lines ──────────────────────────────────────────────

function FlowArrow({ active }: { active: boolean }) {
  return (
    <div className={`flex flex-col items-center py-1 transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`}>
      <div className={`w-0.5 h-6 ${active ? 'bg-accent-purple' : 'bg-white/10'}`} />
      <svg className={`w-4 h-4 ${active ? 'text-accent-purple' : 'text-white/20'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
      <div className={`w-0.5 h-6 ${active ? 'bg-accent-purple' : 'bg-white/10'}`} />
    </div>
  );
}

function FlowNode({
  label,
  sublabel,
  icon,
  active,
  done,
}: {
  label: string;
  sublabel: string;
  icon: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className={`step-card flex items-center gap-4 transition-all duration-700 ${
      active ? 'step-active' : done ? 'step-done' : ''
    }`}>
      <div className={`text-2xl transition-all duration-700 ${active ? 'scale-110' : ''}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className={`font-medium text-sm transition-colors ${active ? 'text-white' : done ? 'text-gray-300' : 'text-gray-500'}`}>
          {label}
        </div>
        <div className="text-xs text-gray-500 truncate">{sublabel}</div>
      </div>
      {done && <IconCheck />}
      {active && <IconSpinner />}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function DemoPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ text: string; type: 'info' | 'success' | 'error' | 'warn' }>>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Determine the current active step for animation
  const currentStepIndex = result?.steps?.findLastIndex((s) => s.status === 'running') ?? -1;

  const addLog = (text: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
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

      // Animate through the steps in the UI by adding logs with delays
      for (const step of data.steps) {
        await new Promise((r) => setTimeout(r, 400));
        if (step.status === 'done') {
          addLog(`✅ ${step.label} — ${step.detail}`, 'success');
        } else if (step.status === 'error') {
          addLog(`❌ ${step.label} — ${step.detail}`, 'error');
        } else {
          addLog(`⏳ ${step.label}...`, 'info');
        }
      }

      if (data.success && data.payment) {
        addLog(`────────────────────────`, 'info');
        addLog(`💰 Total cost: $${data.payment.totalCost} USDC`, 'success');
        addLog(`   API fee:    $${data.payment.apiCost} USDC`, 'info');
        addLog(`   Gas fee:    $${data.payment.gasCost} USDC`, 'info');
        addLog(`   Tx Hash:    ${data.payment.txHash}`, 'info');
        addLog(`   Remaining:  $${data.payment.remainingBudget} USDC today`, 'info');
        addLog(`────────────────────────`, 'info');
      }
    } catch (err: any) {
      const msg = err?.message || 'Request failed';
      setError(msg);
      addLog(`❌ ${msg}`, 'error');
    } finally {
      setRunning(false);
    }
  }, []);

  // Derive animation states
  const flowSteps = [
    { key: 'request', icon: '🌐', label: 'Agent Wallet', sublabel: 'Smart account + ERC-4337 bundler' },
    { key: 'x402', icon: '⚡', label: 'x402 Request', sublabel: 'GET /api/merchant?city=Tokyo' },
    { key: 'payment', icon: '💸', label: 'Auto-Pay', sublabel: '$0.28 USDC via SmoothSend' },
    { key: 'data', icon: '✅', label: 'Data Received', sublabel: '25°C, sunny — paid in USDC' },
  ];

  const flowIndexMap = ['request', 'x402', 'payment', 'data'];
  const activeFlowIdx = result
    ? Math.min(
        flowIndexMap.findIndex((k) => {
          const step = result.steps.find((s) => s.label.toLowerCase().includes(
            k === 'request' ? 'wallet' :
            k === 'x402' ? 'x402' :
            k === 'payment' ? 'payment' : 'data'
          ));
          return !step || step.status === 'running' || step.status === 'pending';
        }),
        flowIndexMap.length - 1
      )
    : -1;

  return (
    <main className="min-h-screen relative">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent-purple/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-blue/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-purple/10 border border-accent-purple/20 text-accent-purple text-xs font-medium mb-4">
            🔬 Avalanche Hackathon 2026
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
            Agent Wallet
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            AI agents pay for APIs in <span className="text-accent-cyan font-medium">USDC</span> — including gas.
            No <span className="text-red-400/70 line-through">AVAX</span> needed.
          </p>
          <div className="flex justify-center gap-4 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">⚡ x402 Protocol</span>
            <span className="flex items-center gap-1">🏦 ERC-4337 Smart Accounts</span>
            <span className="flex items-center gap-1">💳 user-pays-erc20</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left — Flow Diagram */}
          <div className="lg:col-span-3 space-y-0">
            <div className="flex flex-col items-center">
              {flowSteps.map((step, idx) => {
                const globalIdx = flowIndexMap.indexOf(step.key);
                const requestStep = result?.steps.find((s) =>
                  s.label.toLowerCase().includes(
                    step.key === 'request' ? 'wallet' :
                    step.key === 'x402' ? 'x402' :
                    step.key === 'payment' ? 'payment' : 'data'
                  )
                );
                const isActive = globalIdx === activeFlowIdx && result !== null;
                const isDone = result && (globalIdx < activeFlowIdx || (globalIdx === activeFlowIdx && result.steps.every(s => s.status === 'done')));
                return (
                  <div key={step.key} className="w-full max-w-md">
                    <FlowNode
                      label={step.label}
                      sublabel={step.sublabel}
                      icon={step.icon}
                      active={isActive}
                      done={!!isDone}
                    />
                    {idx < flowSteps.length - 1 && <FlowArrow active={isDone || isActive} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right — Controls + Logs */}
          <div className="lg:col-span-2 space-y-4">
            {/* Run Button */}
            <div className="step-card text-center">
              <button
                onClick={runDemo}
                disabled={running}
                className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-300 ${
                  running
                    ? 'bg-accent-purple/20 text-accent-purple/60 cursor-not-allowed'
                    : 'bg-accent-purple hover:bg-accent-purple/90 text-white shadow-lg shadow-accent-purple/20 hover:shadow-accent-purple/30 active:scale-[0.98]'
                }`}
              >
                {running ? (
                  <span className="flex items-center justify-center gap-2">
                    <IconSpinner /> Running Demo...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    ▶ Run x402 Demo
                  </span>
                )}
              </button>
              {result?.success && (
                <p className="text-xs text-gray-500 mt-3">
                  ⚡ Real transaction on <span className="text-accent-cyan font-mono">{result.network || 'avalanche-fuji'}</span>
                </p>
              )}
            </div>

            {/* Payment Summary (when done) */}
            {result?.success && result.payment && (
              <div className="step-card space-y-2 animate-slide-up">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Payment</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-500 text-xs">Total Cost</div>
                    <div className="font-semibold text-accent-green">${result.payment.totalCost} USDC</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Gas Fee</div>
                    <div className="font-mono text-xs text-gray-300">${result.payment.gasCost} USDC</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">API Fee</div>
                    <div className="font-mono text-xs text-gray-300">${result.payment.apiCost} USDC</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Remaining Budget</div>
                    <div className="font-mono text-xs text-gray-300">${result.payment.remainingBudget} USDC</div>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/5">
                  <div className="text-gray-500 text-xs mb-1">Transaction</div>
                  <TxLink txHash={result.payment.txHash} network={result.network} />
                </div>
              </div>
            )}

            {/* Data Results (when done) */}
            {result?.success && result.result && (
              <div className="step-card space-y-2 animate-slide-up">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Data</h3>
                {result.result.weather && (
                  <div className="flex items-center gap-3 p-2 bg-white/5 rounded-lg">
                    <span className="text-2xl">
                      {result.result.weather.condition === 'sunny' ? '☀️' :
                       result.result.weather.condition === 'cloudy' ? '☁️' :
                       result.result.weather.condition === 'clear' ? '🌤️' :
                       result.result.weather.condition === 'thunderstorms' ? '⛈️' : '🌡️'}
                    </span>
                    <div>
                      <div className="font-medium">{result.result.weather.city}</div>
                      <div className="text-sm text-gray-400">
                        {result.result.weather.temperature}°C, {result.result.weather.condition}
                      </div>
                    </div>
                  </div>
                )}
                {result.result.crypto && (
                  <div className="flex items-center gap-3 p-2 bg-white/5 rounded-lg">
                    <span className="text-2xl">🪙</span>
                    <div>
                      <div className="font-medium">{result.result.crypto.symbol}</div>
                      <div className="text-sm text-gray-400">${result.result.crypto.price}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Wallet Info (when done) */}
            {result?.success && result.wallet && (
              <div className="step-card space-y-1.5 animate-slide-up">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Wallet</h3>
                <div className="text-xs font-mono text-gray-400 truncate">
                  Smart Account: {result.wallet.address}
                </div>
                <div className="text-xs font-mono text-gray-500 truncate">
                  EOA: {result.wallet.eoa}
                </div>
                <div className="text-xs text-gray-500">
                  Balance: <span className="text-accent-green">${parseFloat(result.wallet.balance).toFixed(2)} USDC</span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="step-card border-red-400/20 animate-fade-in">
                <div className="flex items-center gap-2 text-red-400">
                  <IconError />
                  <span className="text-sm font-medium">Error</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Terminal Logs */}
        <div className="mt-8 step-card max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-400/60" />
              <div className="w-3 h-3 rounded-full bg-accent-green/60" />
            </div>
            <span className="text-xs text-gray-500 font-mono">console.log</span>
          </div>
          <div className="bg-black/40 rounded-lg p-4 font-mono text-sm max-h-64 overflow-y-auto space-y-1">
            {logs.length === 0 && !running && (
              <div className="text-gray-600 italic">Click "Run x402 Demo" to start the flow...</div>
            )}
            {logs.map((log, i) => (
              <LogLine key={i} text={log.text} type={log.type} />
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Network info footer */}
        <div className="mt-8 text-center text-xs text-gray-600">
          Built on{' '}
          <a href="https://smoothsend.xyz" target="_blank" rel="noopener noreferrer" className="text-accent-cyan hover:underline">
            SmoothSend
          </a>
          {' '}ERC-4337 infrastructure ·{' '}
          <a href="https://github.com/ivedmohan/agent-wallet" target="_blank" rel="noopener noreferrer" className="text-accent-cyan hover:underline">
            GitHub
          </a>
        </div>
      </div>
    </main>
  );
}
