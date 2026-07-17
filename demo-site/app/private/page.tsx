'use client';

import '../polyfills';
import { useEffect, useState } from 'react';
import { parseUnits, formatUnits } from 'viem';
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient } from 'wagmi';
import { useEERC } from '@avalabs/ac-eerc-sdk';

const EERC_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_EERC_CONTRACT_ADDRESS as `0x${string}` | undefined;
const EERC_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_EERC_TOKEN_ADDRESS as `0x${string}` | undefined;
const EERC_MODE = (process.env.NEXT_PUBLIC_EERC_MODE || 'converter') as 'standalone' | 'converter';
const EERC_DECIMALS = Number(process.env.NEXT_PUBLIC_EERC_DECIMALS || '6');
const EERC_CIRCUITS_JSON = process.env.NEXT_PUBLIC_EERC_CIRCUITS_JSON || '';

function readCircuitConfig(): Record<string, unknown> | null {
  if (!EERC_CIRCUITS_JSON) return null;
  try {
    return JSON.parse(EERC_CIRCUITS_JSON);
  } catch {
    return null;
  }
}

const CIRCUIT_CONFIG = readCircuitConfig();

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/70">
      {children}
    </span>
  );
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#0e1220]/85 p-6 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="mb-5">
        <div className="mb-2 text-[11px] uppercase tracking-[0.28em] text-cyan-300/70">{eyebrow}</div>
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

type DemoEncryptedBalanceSnapshot = {
  decryptedBalance: bigint;
  parsedDecryptedBalance: string;
  encryptedBalance: bigint[];
  auditorPublicKey: bigint[];
  decimals: bigint;
};

type DemoEercBridge = {
  getBalanceSnapshot(requestedTokenAddress?: `0x${string}`): Promise<DemoEncryptedBalanceSnapshot>;
  transfer(
    to: `0x${string}`,
    amount: bigint,
    requestedTokenAddress?: `0x${string}`,
  ): Promise<{ transactionHash: string; receiverEncryptedAmount?: string[]; senderEncryptedAmount?: string[] }>;
};

function createDemoEercBridge(params: {
  eerc: any;
  tokenAddress?: `0x${string}`;
  snapshot?: any;
  decimals: number;
}): DemoEercBridge {
  const { eerc, tokenAddress, snapshot, decimals } = params;
  return {
    async getBalanceSnapshot(requestedTokenAddress) {
      const activeSnapshot = snapshot ?? {};
      const parsedDecryptedBalance = String(
        activeSnapshot.formattedBalance ??
        activeSnapshot.decryptedBalance ??
        activeSnapshot.balance ??
        '0'
      );
      const decryptedBalance = typeof activeSnapshot.decryptedBalance === 'bigint'
        ? activeSnapshot.decryptedBalance
        : parseUnits(parsedDecryptedBalance.replace(/[^0-9.]/g, '') || '0', decimals);
      return {
        decryptedBalance,
        parsedDecryptedBalance,
        encryptedBalance: activeSnapshot.encryptedBalance ?? [],
        auditorPublicKey: activeSnapshot.auditorPublicKey ?? [],
        decimals: BigInt(activeSnapshot.decimals ?? decimals),
      };
    },
    async transfer(to, amount, requestedTokenAddress) {
      const result = await eerc.privateTransfer({
        to,
        amount,
        memo: 'Private agent payout',
        tokenAddress: requestedTokenAddress ?? tokenAddress,
      });
      return {
        transactionHash: result?.transactionHash ?? result?.txHash ?? '',
        receiverEncryptedAmount: result?.receiverEncryptedAmount,
        senderEncryptedAmount: result?.senderEncryptedAmount,
      };
    },
  };
}

export default function PrivateEercPage() {
  if (!EERC_CONTRACT_ADDRESS || !CIRCUIT_CONFIG) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(18,24,46,0.95),_rgba(5,8,18,1))] px-6 py-12 text-white">
        <div className="mx-auto max-w-3xl">
          <Pill>eERC setup required</Pill>
          <h1 className="mt-4 text-4xl font-semibold">Private Amount Demo</h1>
          <p className="mt-4 max-w-2xl text-white/70">
            The real privacy flow needs a deployed eERC contract suite plus the circuit URLs from the deployment output.
            This page is wired for that flow, but it will stay in setup mode until those values are added.
          </p>
          <div className="mt-8 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-100">
            Missing configuration:
            <ul className="mt-3 list-disc space-y-2 pl-5 text-amber-50/90">
              {!EERC_CONTRACT_ADDRESS && <li>`NEXT_PUBLIC_EERC_CONTRACT_ADDRESS`</li>}
              {!CIRCUIT_CONFIG && <li>`NEXT_PUBLIC_EERC_CIRCUITS_JSON`</li>}
            </ul>
          </div>
        </div>
      </main>
    );
  }

  return <PrivateEercPanel />;
}

function PrivateEercPanel() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [decryptionKey, setDecryptionKey] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('0.01');
  const [memo, setMemo] = useState('Private agent payout');
  const [status, setStatus] = useState<string>('Ready');
  const [txHash, setTxHash] = useState<string>('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('agent-wallet-eerc-key');
    if (saved) setDecryptionKey(saved);
  }, []);

  useEffect(() => {
    if (decryptionKey) window.localStorage.setItem('agent-wallet-eerc-key', decryptionKey);
  }, [decryptionKey]);

  const eerc = useEERC(
    publicClient as any,
    walletClient as any,
    EERC_CONTRACT_ADDRESS!,
    CIRCUIT_CONFIG as any,
    decryptionKey || undefined,
  ) as any;

  const encryptedBalance = eerc?.useEncryptedBalance?.(EERC_TOKEN_ADDRESS) as any;
  const isConverter = EERC_MODE === 'converter';
  const maybeBalance =
    encryptedBalance?.formattedBalance ??
    encryptedBalance?.decryptedBalance ??
    encryptedBalance?.balance ??
    encryptedBalance?.data ??
    'hidden';
  const eercBridge = createDemoEercBridge({
    eerc,
    tokenAddress: EERC_TOKEN_ADDRESS,
    snapshot: encryptedBalance,
    decimals: EERC_DECIMALS,
  });

  const connectInjected = () => {
    const injected = connectors[0];
    if (!injected) {
      setStatus('No injected wallet connector found');
      return;
    }
    connect({ connector: injected });
  };

  const generateKey = async () => {
    try {
      setStatus('Generating decryption key...');
      const generated = await eerc?.generateDecryptionKey?.();
      if (!generated) throw new Error('SDK did not return a key');
      setDecryptionKey(String(generated));
      setStatus('Decryption key ready');
    } catch (err: any) {
      setStatus(err?.message || 'Failed to generate key');
    }
  };

  const submitPrivateTransfer = async () => {
    try {
      setPending(true);
      setStatus('Submitting private transfer...');
      const amountWei = parseUnits(amount || '0', EERC_DECIMALS);
      const result = await eercBridge.transfer(
        recipient as `0x${string}`,
        amountWei,
        EERC_TOKEN_ADDRESS,
      );
      setTxHash(result.transactionHash);
      setStatus('Private transfer submitted');
    } catch (err: any) {
      setStatus(err?.message || 'Transfer failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(18,24,46,0.95),_rgba(5,8,18,1))] px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Pill>eERC private rail</Pill>
            <h1 className="mt-4 text-4xl font-semibold">Private Agent Wallet</h1>
            <p className="mt-3 max-w-2xl text-white/70">
              This page uses the eERC SDK to hide transfer amounts on-chain instead of only hiding them in the UI.
              It is the actual privacy path for the hackathon demo.
            </p>
          </div>
          <div className="flex gap-3">
            {isConnected ? (
              <button
                type="button"
                onClick={() => disconnect()}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={connectInjected}
                className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel eyebrow="Status" title="Encrypted balance + wallet state">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-white/40">Wallet</div>
                <div className="mt-2 font-mono text-sm text-white/80">{address ?? 'Not connected'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-white/40">Encrypted balance</div>
                <div className="mt-2 font-mono text-sm text-white/80">{String(maybeBalance)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-white/40">Mode</div>
                <div className="mt-2 text-sm text-white/80">{isConverter ? 'Converter mode' : 'Standalone mode'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-white/40">SDK status</div>
                <div className="mt-2 text-sm text-white/80">{status}</div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={generateKey}
                disabled={!isConnected || pending}
                className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Generate decryption key
              </button>
              <button
                type="button"
                onClick={() => eerc?.register?.()}
                disabled={!isConnected || pending}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Register encrypted account
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <label className="text-xs uppercase tracking-[0.24em] text-white/40">Decryption key</label>
              <textarea
                value={decryptionKey}
                onChange={(e) => setDecryptionKey(e.target.value)}
                placeholder="Paste or generate your private decryption key here"
                className="mt-3 min-h-28 w-full rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 font-mono text-xs text-white/80 outline-none transition placeholder:text-white/20 focus:border-cyan-400/40"
              />
            </div>
          </Panel>

          <Panel eyebrow="Action" title="Send a hidden-value payment">
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-xs uppercase tracking-[0.24em] text-white/40">Recipient</span>
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="0x..."
                  className="rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 font-mono text-sm text-white/80 outline-none transition placeholder:text-white/20 focus:border-cyan-400/40"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-xs uppercase tracking-[0.24em] text-white/40">Amount</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 font-mono text-sm text-white/80 outline-none transition focus:border-cyan-400/40"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs uppercase tracking-[0.24em] text-white/40">Memo</span>
                  <input
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 font-mono text-sm text-white/80 outline-none transition focus:border-cyan-400/40"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={submitPrivateTransfer}
                  disabled={!isConnected || pending}
                  className="rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Private transfer
                </button>
              </div>

              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-cyan-50/80">
                <div className="text-xs uppercase tracking-[0.24em] text-cyan-200/50">Explorer expectation</div>
                <p className="mt-2">
                  With eERC deployed, the transfer amount should not appear as a plain value on the public explorer. If it does, we are still on the wrong flow.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-white/40">Latest tx</div>
                <div className="mt-2 font-mono text-sm text-white/80 break-all">
                  {txHash || 'No private tx submitted yet'}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-white/40">Public token amount preview</div>
                <div className="mt-2 text-sm text-white/70">
                  {formatUnits(parseUnits(amount || '0', EERC_DECIMALS), EERC_DECIMALS)} token units
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}
