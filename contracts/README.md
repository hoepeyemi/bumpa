# Bumpa Subscription Smart Contracts

Hardhat project for the on-chain subscription system used by the Bumpa frontend.

## Contracts

- **SubscriptionManager**: Users subscribe to a recipient with a fixed amount and frequency (weekly/monthly/yearly). Payments are made in ERC20 (e.g. USDC). Events (`SubscriptionCreated`, `PaymentMade`, `SubscriptionCancelled`) allow the backend to index and sync with the existing API.

## Setup

```bash
cd contracts
yarn install
yarn compile
```

## Deploy (Flow EVM Testnet)

1. Create `.env` in `contracts/` with:
   ```
   PRIVATE_KEY=0x...   # Deployer wallet private key
   ```
2. Deploy:
   ```bash
   yarn deploy:testnet
   ```
   (Uses Flow testnet by default; see `hardhat.config.ts` for `flow-testnet` network.)
3. Set in app `.env`:
   ```
   VITE_SUBSCRIPTION_CONTRACT_ADDRESS=<deployed address>
   ```

## Export ABI for frontend

After compiling:

```bash
npx hardhat run scripts/export-abi.ts
```

This writes the ABI to `app/src/contracts/SubscriptionManager.json`. The app also has a minimal inline ABI in `subscriptionContract.ts` for direct use with viem.

## Usage from frontend

- **Create subscription**: `subscribe(recipientAddress, amountPerCycleInBaseUnits, frequency)` where `frequency` is 0 = Weekly, 1 = Monthly, 2 = Yearly. USDC has 6 decimals (e.g. 10 USDC = 10e6).
- **Pay**: User must first `approve(SubscriptionManager, amount)` on the USDC contract, then call `pay(subscriptionId)`.
- **Cancel**: `cancel(subscriptionId)` (callable only by subscriber).

Backend can listen for `PaymentMade` and call the existing `recordPayment` API with `transactionHash` to keep the database in sync.

## Test

```bash
yarn test
```

## Network config

- **Flow EVM Testnet** (default): chainId 545, RPC `https://testnet.evm.nodes.onflow.org`, Explorer `https://evm-testnet.flowscan.io`
- **Cronos Testnet**: chainId 338, RPC `https://evm-t3.cronos.org`
- **Cronos Mainnet**: chainId 25, RPC `https://evm.cronos.org`

USDC: set `USDC_ADDRESS` in `.env` for the token on your target network (e.g. Flow testnet may use a different stablecoin address).
