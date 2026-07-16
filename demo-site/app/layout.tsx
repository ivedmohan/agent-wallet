import type { Metadata } from 'next';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Private Agent Wallet — x402 Demo',
  description:
    'AI agents pay for APIs in USDC — including gas — while spend details stay masked in the UI. Built on SmoothSend ERC-4337 paymaster infrastructure.',
  openGraph: {
    title: 'Private Agent Wallet — x402 Demo',
    description:
      'AI agents pay for APIs in USDC — including gas — while spend details stay masked in the UI. Built on SmoothSend.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="scanline">{children}</body>
    </html>
  );
}
