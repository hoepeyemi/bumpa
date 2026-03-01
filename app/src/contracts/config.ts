/**
 * Subscription smart contract configuration.
 * SubscriptionManagerFLOW (native FLOW) on Flow EVM Testnet.
 * Override with VITE_SUBSCRIPTION_CONTRACT_ADDRESS in .env if needed.
 */
export const SUBSCRIPTION_CONTRACT_ADDRESS =
  (import.meta.env.VITE_SUBSCRIPTION_CONTRACT_ADDRESS as string | undefined) ||
  "0x5ef3B3C4203E0900361886f450F803B5F443010D";

/** Flow EVM Testnet */
export const FLOW_TESTNET_CHAIN_ID = 545;
export const FLOW_TESTNET_RPC = "https://testnet.evm.nodes.onflow.org";
export const FLOW_TESTNET_EXPLORER = "https://evm-testnet.flowscan.io";
