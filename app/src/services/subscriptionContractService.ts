/**
 * SubscriptionManager smart contract service.
 * Reads from chain and prepares transactions for subscribe, pay, cancel.
 * Use with useSendTransaction in the UI to send the prepared txs.
 */
import {
  getContract,
  readContract,
  prepareContractCall,
  type ThirdwebClient,
  type Chain,
} from "thirdweb";
import { formatUnits, parseUnits } from "viem";
import { SUBSCRIPTION_CONTRACT_ADDRESS } from "../contracts/config";
import {
  SUBSCRIPTION_ABI,
  type Frequency,
  type SubscriptionOnChain,
} from "../contracts/subscriptionContract";
import type { Subscription } from "./subscriptionService";

const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

function getSubscriptionManagerContract(client: ThirdwebClient, chain: Chain) {
  if (!SUBSCRIPTION_CONTRACT_ADDRESS) {
    throw new Error("SubscriptionManager contract address not set");
  }
  return getContract({
    client,
    chain,
    address: SUBSCRIPTION_CONTRACT_ADDRESS as `0x${string}`,
    abi: SUBSCRIPTION_ABI,
  });
}

/** Map contract frequency enum to UI frequency */
export function frequencyFromChain(f: number): "weekly" | "monthly" | "yearly" {
  if (f === 0) return "weekly";
  if (f === 1) return "monthly";
  return "yearly";
}

/** Map UI frequency to contract enum (0=Weekly, 1=Monthly, 2=Yearly) */
export function frequencyToChain(
  f: "weekly" | "monthly" | "yearly"
): Frequency {
  if (f === "weekly") return 0;
  if (f === "monthly") return 1;
  return 2;
}

/** Map on-chain subscription to UI Subscription type */
export function onChainToSubscription(onc: SubscriptionOnChain): Subscription {
  const cost = Number(formatUnits(onc.amountPerCycle, 6));
  const nextDueAt = Number(onc.nextDueAt) * 1000;
  return {
    id: String(onc.id),
    service: `Subscription to ${onc.recipient.slice(0, 8)}...`,
    cost,
    frequency: frequencyFromChain(onc.frequency),
    recipientAddress: onc.recipient,
    lastPaymentDate: null,
    nextPaymentDate: new Date(nextDueAt),
    isActive: onc.active,
    autoPay: true,
  };
}

/** Load all subscription IDs for a subscriber */
export async function getSubscriptionIds(
  client: ThirdwebClient,
  chain: Chain,
  userAddress: string
): Promise<bigint[]> {
  const contract = getSubscriptionManagerContract(client, chain);
  const ids = await readContract({
    contract,
    method: "function getSubscriptionsBySubscriber(address) view returns (uint256[])",
    params: [userAddress as `0x${string}`],
  });
  return ids as bigint[];
}

/** Load a single subscription by ID */
export async function getSubscriptionOnChain(
  client: ThirdwebClient,
  chain: Chain,
  subscriptionId: bigint
): Promise<SubscriptionOnChain> {
  const contract = getSubscriptionManagerContract(client, chain);
  const result = await readContract({
    contract,
    method: "function getSubscription(uint256) view returns (uint256 id, address subscriber, address recipient, uint256 amountPerCycle, uint8 frequency, uint256 nextDueAt, bool active, uint256 createdAt)",
    params: [subscriptionId],
  }) as { id: bigint; subscriber: `0x${string}`; recipient: `0x${string}`; amountPerCycle: bigint; frequency: number; nextDueAt: bigint; active: boolean; createdAt: bigint };
  return {
    id: result.id,
    subscriber: result.subscriber,
    recipient: result.recipient,
    amountPerCycle: result.amountPerCycle,
    frequency: result.frequency as Frequency,
    nextDueAt: result.nextDueAt,
    active: result.active,
    createdAt: result.createdAt,
  };
}

/** Load all subscriptions for a user from chain and map to UI type */
export async function loadSubscriptionsFromChain(
  client: ThirdwebClient,
  chain: Chain,
  userAddress: string
): Promise<Subscription[]> {
  const ids = await getSubscriptionIds(client, chain, userAddress);
  const subs: Subscription[] = [];
  for (const id of ids) {
    const onc = await getSubscriptionOnChain(client, chain, id);
    subs.push(onChainToSubscription(onc));
  }
  return subs;
}

/** Check if payment is due for a subscription (on-chain) */
export async function isPaymentDueOnChain(
  client: ThirdwebClient,
  chain: Chain,
  subscriptionId: bigint
): Promise<boolean> {
  const contract = getSubscriptionManagerContract(client, chain);
  return readContract({
    contract,
    method: "function isPaymentDue(uint256) view returns (bool)",
    params: [subscriptionId],
  }) as Promise<boolean>;
}

/** Get payment token address from the contract */
export async function getPaymentTokenAddress(
  client: ThirdwebClient,
  chain: Chain
): Promise<`0x${string}`> {
  const contract = getSubscriptionManagerContract(client, chain);
  return readContract({
    contract,
    method: "function paymentToken() view returns (address)",
    params: [],
  }) as Promise<`0x${string}`>;
}

/** Prepare subscribe transaction */
export function prepareSubscribe(
  client: ThirdwebClient,
  chain: Chain,
  recipient: string,
  costUsdc: number,
  frequency: "weekly" | "monthly" | "yearly"
) {
  const contract = getSubscriptionManagerContract(client, chain);
  const amountPerCycle = parseUnits(costUsdc.toFixed(6), 6);
  return prepareContractCall({
    contract,
    method: "function subscribe(address recipient, uint256 amountPerCycle, uint8 frequency) returns (uint256)",
    params: [recipient as `0x${string}`, amountPerCycle, frequencyToChain(frequency)],
  });
}

/** Prepare ERC20 approve transaction (for pay) */
export function prepareApprove(
  client: ThirdwebClient,
  chain: Chain,
  tokenAddress: `0x${string}`,
  spender: string,
  amount: bigint
) {
  const tokenContract = getContract({
    client,
    chain,
    address: tokenAddress,
    abi: ERC20_ABI,
  });
  return prepareContractCall({
    contract: tokenContract,
    method: "function approve(address spender, uint256 amount) returns (bool)",
    params: [spender as `0x${string}`, amount],
  });
}

/** Prepare pay transaction (call after approving the contract to spend USDC) */
export function preparePay(
  client: ThirdwebClient,
  chain: Chain,
  subscriptionId: string
) {
  const contract = getSubscriptionManagerContract(client, chain);
  return prepareContractCall({
    contract,
    method: "function pay(uint256 subscriptionId)",
    params: [BigInt(subscriptionId)],
  });
}

/**
 * Prepare [approve, pay] transaction sequence for a subscription.
 * UI should send approve first, then on success send pay.
 */
export async function preparePaySequence(
  client: ThirdwebClient,
  chain: Chain,
  subscriptionId: string,
  amountPerCycleBaseUnits: bigint
): Promise<[ReturnType<typeof prepareApprove>, ReturnType<typeof preparePay>>] {
  const tokenAddress = await getPaymentTokenAddress(client, chain);
  const approveTx = prepareApprove(
    client,
    chain,
    tokenAddress,
    SUBSCRIPTION_CONTRACT_ADDRESS!,
    amountPerCycleBaseUnits
  );
  const payTx = preparePay(client, chain, subscriptionId);
  return [approveTx, payTx];
}

/** Prepare cancel transaction */
export function prepareCancel(
  client: ThirdwebClient,
  chain: Chain,
  subscriptionId: string
) {
  const contract = getSubscriptionManagerContract(client, chain);
  return prepareContractCall({
    contract,
    method: "function cancel(uint256 subscriptionId)",
    params: [BigInt(subscriptionId)],
  });
}
