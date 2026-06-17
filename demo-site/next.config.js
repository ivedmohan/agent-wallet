/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  serverExternalPackages: ['ethers'],
  webpack: (config) => {
    config.resolve.alias['@vedmohan/agent-wallet'] = path.join(__dirname, '../dist/index.js');
    return config;
  },
  outputFileTracingRoot: path.join(__dirname, '..'),
};

export default nextConfig;
