import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n═══════════════════════════════════════════════");
  console.log("ERC-8004 Agent Registry Deployment");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "AVAX\n");

  // ── Deploy IdentityRegistry ──────────────────────────────────
  console.log("1/3 Deploying IdentityRegistry...");
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy();
  await identityRegistry.waitForDeployment();
  const idAddr = await identityRegistry.getAddress();
  console.log("   ✓ IdentityRegistry:", idAddr);

  // ── Deploy ReputationRegistry ────────────────────────────────
  console.log("2/3 Deploying ReputationRegistry...");
  const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
  const reputationRegistry = await ReputationRegistry.deploy();
  await reputationRegistry.waitForDeployment();
  const repAddr = await reputationRegistry.getAddress();
  console.log("   ✓ ReputationRegistry:", repAddr);

  // ── Initialize ReputationRegistry ────────────────────────────
  console.log("3/3 Initializing ReputationRegistry → linking IdentityRegistry...");
  const initTx = await reputationRegistry.initialize(idAddr);
  await initTx.wait();
  console.log("   ✓ Initialized");

  // ── Register a test agent ─────────────────────────────────────
  const agentMetadata = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Agent Wallet Demo",
    description: "AI agent paying for APIs via x402 on Avalanche. Built on SmoothSend ERC-4337.",
    image: "",
    services: [{ name: "x402", endpoint: "https://agent-wallet.vercel.app/api/merchant", version: "1.0.0" }],
    x402Support: true,
    active: true,
    registrations: [],
    supportedTrust: ["reputation"]
  };
  const agentURI = "data:application/json;base64," + Buffer.from(JSON.stringify(agentMetadata)).toString("base64");
  // Use explicit function call to avoid overload ambiguity
  // register(string) is what we want
  const registerTx = await identityRegistry["register(string)"](agentURI);
  await registerTx.wait();
  const owner = await identityRegistry.getAgentWallet(1);
  console.log("\n   ✓ Test Agent ID 1 registered. Wallet:", owner);

  // ── Summary ──────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════");
  console.log("Deployment Complete!");
  console.log("═══════════════════════════════════════════════");
  console.log(`IDENTITY_REGISTRY=${idAddr}`);
  console.log(`REPUTATION_REGISTRY=${repAddr}`);
  console.log(`AGENT_ID=1`);
  console.log("\nView on Snowtrace:");
  console.log(`  https://testnet.snowtrace.io/address/${idAddr}`);
  console.log(`  https://testnet.snowtrace.io/address/${repAddr}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
