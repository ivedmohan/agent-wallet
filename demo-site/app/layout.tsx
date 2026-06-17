import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Wallet — x402 Payment Demo',
  description:
    'AI agents pay for APIs in USDC — including gas. No AVAX needed. Built on SmoothSend ERC-4337 paymaster infrastructure.',
  openGraph: {
    title: 'Agent Wallet — x402 Payment Demo',
    description:
      'AI agents pay for APIs in USDC — including gas. No AVAX needed. Built on SmoothSend.',
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
