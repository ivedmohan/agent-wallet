// @ts-expect-error - Next resolves this JS bundle at runtime; we only need the runtime export surface here.
export * from './node_modules/wagmi/dist/esm/exports/index.js';
export { erc20Abi as erc20ABI } from 'viem';
