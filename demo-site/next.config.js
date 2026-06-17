/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  serverExternalPackages: ['ethers'],
  outputFileTracingRoot: path.join(__dirname, '..'),
  webpack: (config) => {
    // Ensure a single React instance across SDK deps and the app
    config.resolve.alias.react = path.join(__dirname, 'node_modules/react');
    config.resolve.alias['react-dom'] = path.join(__dirname, 'node_modules/react-dom');
    return config;
  },
};

export default nextConfig;
