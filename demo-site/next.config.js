/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const webpack = require('webpack');

const nextConfig = {
  serverExternalPackages: ['ethers'],
  outputFileTracingRoot: path.join(__dirname, '..'),
  webpack: (config) => {
    // Ensure a single React instance across SDK deps and the app
    config.resolve.alias.react = path.join(__dirname, 'node_modules/react');
    config.resolve.alias['react-dom'] = path.join(__dirname, 'node_modules/react-dom');
    config.resolve.alias.wagmi = path.join(__dirname, 'wagmi-shim.ts');
    config.resolve.alias['node:crypto'] = require.resolve('crypto-browserify');
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
      process: require.resolve('process/browser'),
    };
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser',
      }),
      new webpack.NormalModuleReplacementPlugin(/^node:(.*)$/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '');
      }),
    );
    return config;
  },
};

export default nextConfig;
