import { ethers } from "hardhat";

// Default payment token; set USDC_ADDRESS in .env for Flow testnet (or other network)
const USDC_DEFAULT = "0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SubscriptionManager with account:", deployer.address);

  const paymentToken = process.env.USDC_ADDRESS || USDC_DEFAULT;
  const SubscriptionManager = await ethers.getContractFactory("SubscriptionManager");
  const manager = await SubscriptionManager.deploy(paymentToken);
  await manager.waitForDeployment();
  const address = await manager.getAddress();
  console.log("SubscriptionManager deployed to:", address);
  console.log("Payment token (USDC):", paymentToken);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
