const fs = require('fs');
const path = require('path');
const solc = require('solc');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'contracts');

const sources = [
  'contracts/IdentityRegistry.sol',
  'contracts/ReputationRegistry.sol',
  'contracts/PrivatePaymentEnvelopeRegistry.sol',
];

function readSource(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function findImports(importPath) {
  const localPath = path.join(root, importPath);
  if (fs.existsSync(localPath)) {
    return { contents: fs.readFileSync(localPath, 'utf8') };
  }

  const nodeModulesPath = path.join(root, 'node_modules', importPath);
  if (fs.existsSync(nodeModulesPath)) {
    return { contents: fs.readFileSync(nodeModulesPath, 'utf8') };
  }

  return { error: `File not found: ${importPath}` };
}

const input = {
  language: 'Solidity',
  sources: Object.fromEntries(sources.map((file) => [file, { content: readSource(file) }])),
  settings: {
    optimizer: { enabled: true, runs: 1_000_000 },
    viaIR: true,
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.bytecode.linkReferences', 'evm.deployedBytecode.linkReferences'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

if (output.errors) {
  for (const error of output.errors) {
    console.error(`${error.severity}: ${error.formattedMessage.trim()}`);
  }
}

if (output.errors && output.errors.some((error) => error.severity === 'error')) {
  process.exit(1);
}

for (const file of sources) {
  const contracts = output.contracts[file] || {};
  for (const [contractName, contractOutput] of Object.entries(contracts)) {
    const artifactDir = path.join(outDir, path.basename(file));
    ensureDir(artifactDir);

    const artifact = {
      _format: 'hh-sol-artifact-1',
      contractName,
      sourceName: file,
      abi: contractOutput.abi,
      bytecode: `0x${contractOutput.evm.bytecode.object}`,
      deployedBytecode: `0x${contractOutput.evm.deployedBytecode.object}`,
      linkReferences: contractOutput.evm.bytecode.linkReferences,
      deployedLinkReferences: contractOutput.evm.deployedBytecode.linkReferences,
    };

    fs.writeFileSync(
      path.join(artifactDir, `${contractName}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`,
    );
  }
}

console.log(`Compiled ${sources.length} Solidity sources offline.`);
