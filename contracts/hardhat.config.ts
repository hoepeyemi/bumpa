import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY && PRIVATE_KEY.startsWith("0x") ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    "flow-testnet": {
      url: "https://testnet.evm.nodes.onflow.org",
      chainId: 545,
      accounts,
    },
    "cronos-testnet": {
      url: "https://evm-t3.cronos.org",
      chainId: 338,
      accounts,
    },
    "cronos-mainnet": {
      url: "https://evm.cronos.org",
      chainId: 25,
      accounts,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
