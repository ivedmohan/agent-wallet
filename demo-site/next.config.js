/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  // Tell Next.js to resolve the monorepo root for imports outside the project
  outputFileTracingRoot: path.join(__dirname, '..'),
  // ethers uses Node.js crypto — tell Next.js it's a server package
  serverExternalPackages: ['ethers'],
  // Alias for SDK source imports
  webpack: (config) => {
    config.resolve.alias['@agent-wallet'] = path.join(__dirname, '../src');
    return config;
  },
};

export default nextConfig;
