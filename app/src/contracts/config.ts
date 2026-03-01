/**
 * Subscription smart contract configuration.
 * Default: deployed SubscriptionManager on Flow EVM Testnet.
 * Override with VITE_SUBSCRIPTION_CONTRACT_ADDRESS in .env if needed.
 */
export const SUBSCRIPTION_CONTRACT_ADDRESS =
  (import.meta.env.VITE_SUBSCRIPTION_CONTRACT_ADDRESS as string | undefined) ||
  "0x470a1a866ef9f4dA1dbac367757AB62d94357f52";

/** Flow EVM Testnet */
export const FLOW_TESTNET_CHAIN_ID = 545;
export const FLOW_TESTNET_RPC = "https://testnet.evm.nodes.onflow.org";
export const FLOW_TESTNET_EXPLORER = "https://evm-testnet.flowscan.io";

export const USDC_TESTNET = "0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0";
export const USDC_MAINNET = "0xf951eC28187D9E5Ca673Da8FE6757E6f0Be5F77C";
