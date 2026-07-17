import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Private Agent Wallet — x402 + eERC Demo',
  description:
    'AI agents pay for APIs in USDC and can move value through eERC encrypted transfers on Avalanche. Built on SmoothSend ERC-4337 paymaster infrastructure.',
  openGraph: {
    title: 'Private Agent Wallet — x402 + eERC Demo',
    description:
      'AI agents pay for APIs in USDC and can move value through eERC encrypted transfers on Avalanche. Built on SmoothSend.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="scanline">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
