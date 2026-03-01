/**
 * Subscription smart contract configuration.
 * SubscriptionManagerFLOW (native FLOW) on Flow EVM Testnet.
 * Override with VITE_SUBSCRIPTION_CONTRACT_ADDRESS in .env if needed.
 */
export const SUBSCRIPTION_CONTRACT_ADDRESS =
  (import.meta.env.VITE_SUBSCRIPTION_CONTRACT_ADDRESS as string | undefined) ||
  "0xb2AC0Db5788B222c417F9C1353C5574bC8106C77";

/** Flow EVM Testnet */
export const FLOW_TESTNET_CHAIN_ID = 545;
export const FLOW_TESTNET_RPC = "https://testnet.evm.nodes.onflow.org";
export const FLOW_TESTNET_EXPLORER = "https://evm-testnet.flowscan.io";
