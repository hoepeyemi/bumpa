import { ThirdwebClient } from "thirdweb";
import type { Chain } from "thirdweb";
import { parseUnits } from "viem";
import { loadSubscriptionsFromChain } from "./subscriptionContractService";
import { subscriptionApi, Subscription as ApiSubscription } from "./subscriptionApi";

export interface Subscription {
  id: string;
  service: string;
  cost: number; // in USDC
  frequency: 'monthly' | 'weekly' | 'yearly';
  recipientAddress: string; // Service provider wallet address
  lastPaymentDate: Date | null;
  nextPaymentDate: Date;
  isActive: boolean;
  autoPay: boolean;
  usageData?: {
    lastUsed?: Date;
    usageCount?: number;
    avgUsagePerMonth?: number;
  };
}

// Helper to convert API subscription to local format
function apiToLocalSubscription(apiSub: ApiSubscription): Subscription {
  // Handle cost conversion - it can be number, string, or Decimal
  let costValue: number;
  if (typeof apiSub.cost === 'number') {
    costValue = apiSub.cost;
  } else if (typeof apiSub.cost === 'string') {
    costValue = parseFloat(apiSub.cost);
  } else {
    // Handle Decimal type from Prisma
    costValue = parseFloat(String(apiSub.cost));
  }

  return {
    id: apiSub.id,
    service: apiSub.service?.name || 'Unknown Service',
    cost: costValue,
    frequency: apiSub.frequency as 'monthly' | 'weekly' | 'yearly',
    recipientAddress: apiSub.recipientAddress,
    lastPaymentDate: apiSub.lastPaymentDate ? new Date(apiSub.lastPaymentDate) : null,
    nextPaymentDate: new Date(apiSub.nextPaymentDate),
    isActive: apiSub.isActive,
    autoPay: apiSub.autoPay,
    usageData: apiSub.usageData ? {
      lastUsed: apiSub.usageData.lastUsed ? new Date(apiSub.usageData.lastUsed) : undefined,
      usageCount: apiSub.usageData.usageCount,
      avgUsagePerMonth: apiSub.usageData.avgUsagePerMonth,
    } : undefined,
  };
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

export interface AISuggestion {
  type: 'SAVINGS_OPPORTUNITY' | 'USAGE_ALERT' | 'PAYMENT_REMINDER';
  message: string;
  subscriptions: Subscription[];
  potentialSavings?: number;
}

/**
 * Subscription Agent Service
 * Uses SubscriptionManager smart contract as source of truth (Flow EVM Testnet).
 * Create, pay, and cancel are done via contract; the UI sends transactions and then calls refresh().
 */
export class SubscriptionAgent {
  private subscriptions: Map<string, Subscription> = new Map();
  private paymentHistory: Map<string, Date[]> = new Map();
  private userAddress: string | null = null;

  constructor(
    private client: ThirdwebClient,
    private chain: Chain
  ) {}

  getClient(): ThirdwebClient {
    return this.client;
  }

  getChain(): Chain {
    return this.chain;
  }

  /**
   * Set user address and load subscriptions from chain
   */
  async setUserAddress(userAddress: string) {
    this.userAddress = userAddress;
    await this.loadFromContract();
  }

  /**
   * Reload subscriptions from chain (call after subscribe / pay / cancel)
   */
  async refresh() {
    await this.loadFromContract();
  }

  /**
   * Get all subscriptions
   */
  getAllSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get active subscriptions
   */
  getActiveSubscriptions(): Subscription[] {
    return this.getAllSubscriptions().filter(sub => sub.isActive);
  }

  /**
   * Load subscriptions from SubscriptionManager contract
   */
  async loadFromContract() {
    if (!this.userAddress) {
      console.warn('User address not set, cannot load subscriptions');
      return;
    }

    try {
      const subs = await loadSubscriptionsFromChain(this.client, this.chain, this.userAddress);
      this.subscriptions.clear();
      subs.forEach(sub => this.subscriptions.set(sub.id, sub));
    } catch (error) {
      console.error('Failed to load subscriptions from contract:', error);
    }
  }

  /**
   * Add subscription is done on-chain by the UI (prepareSubscribe + sendTransaction). Then call refresh().
   */
  async addSubscription(_subscription: Omit<Subscription, 'id' | 'lastPaymentDate' | 'nextPaymentDate'>): Promise<Subscription> {
    throw new Error('Use contract: call prepareSubscribe in the UI, send the transaction, then agent.refresh()');
  }

  /**
   * Contract does not support updating a subscription; create a new one and cancel the old if needed.
   */
  async updateSubscription(
    _id: string,
    _updates: Partial<Omit<Subscription, 'id' | 'lastPaymentDate' | 'nextPaymentDate'>>
  ): Promise<boolean> {
    return false;
  }

  /**
   * Get a subscription by ID
   */
  getSubscription(id: string): Subscription | undefined {
    return this.subscriptions.get(id);
  }

  /**
   * Remove a subscription
   */
  async removeSubscription(id: string): Promise<boolean> {
    try {
      await subscriptionApi.deleteSubscription(id);
      const sub = this.subscriptions.get(id);
      if (sub) {
        sub.isActive = false;
        this.subscriptions.set(id, sub);
      }
      return true;
    } catch (error) {
      console.error('Failed to delete subscription:', error);
      return false;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(id: string): Promise<boolean> {
    return this.removeSubscription(id);
  }

  /**
   * Check if payment is due for a subscription
   */
  async checkPaymentDue(subscription: Subscription): Promise<boolean> {
    const now = new Date();
    return subscription.isActive && 
           subscription.autoPay && 
           subscription.nextPaymentDate <= now;
  }

  /**
   * Pay is done on-chain by the UI (approve USDC + contract.pay). Use subscriptionContractService.preparePaySequence.
   */
  async autoPaySubscription(_account: any, _subscription: Subscription): Promise<PaymentResult> {
    return { success: false, error: 'Use UI: send approve then pay transaction via contract' };
  }

  /**
   * Manage all subscriptions - check and auto-pay
   */
  async manageSubscriptions(account: any): Promise<PaymentResult[]> {
    const results: PaymentResult[] = [];
    const subscriptions = this.getActiveSubscriptions();

    for (const sub of subscriptions) {
      const isDue = await this.checkPaymentDue(sub);
      
      if (isDue) {
        const result = await this.autoPaySubscription(account, sub);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * AI-powered cancellation suggestions
   */
  async suggestCancellations(): Promise<AISuggestion[]> {
    const suggestions: AISuggestion[] = [];
    const unused = await this.findUnusedSubscriptions();

    if (unused.length > 0) {
      const savings = this.calculateSavings(unused);
      suggestions.push({
        type: 'SAVINGS_OPPORTUNITY',
        message: `Cancel ${unused.length} unused subscription${unused.length > 1 ? 's' : ''} to save $${savings.toFixed(3)}/month`,
        subscriptions: unused,
        potentialSavings: savings,
      });
    }

    // Check for low usage subscriptions
    const lowUsage = this.findLowUsageSubscriptions();
    if (lowUsage.length > 0) {
      const savings = this.calculateSavings(lowUsage);
      suggestions.push({
        type: 'USAGE_ALERT',
        message: `${lowUsage.length} subscription${lowUsage.length > 1 ? 's have' : ' has'} low usage. Consider canceling to save $${savings.toFixed(3)}/month`,
        subscriptions: lowUsage,
        potentialSavings: savings,
      });
    }

    return suggestions;
  }

  /**
   * Find unused subscriptions (no usage in last 30 days)
   */
  private async findUnusedSubscriptions(): Promise<Subscription[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this.getActiveSubscriptions().filter(sub => {
      if (!sub.usageData?.lastUsed) return true;
      return sub.usageData.lastUsed < thirtyDaysAgo;
    });
  }

  /**
   * Find low usage subscriptions
   */
  private findLowUsageSubscriptions(): Subscription[] {
    return this.getActiveSubscriptions().filter(sub => {
      if (!sub.usageData) return false;
      // Consider low usage if less than 5 uses per month
      return (sub.usageData.avgUsagePerMonth || 0) < 5;
    });
  }

  /**
   * Calculate potential savings
   */
  private calculateSavings(subscriptions: Subscription[]): number {
    return subscriptions.reduce((total, sub) => {
      if (sub.frequency === 'monthly') {
        return total + sub.cost;
      } else if (sub.frequency === 'weekly') {
        return total + (sub.cost * 4); // Approximate monthly
      } else if (sub.frequency === 'yearly') {
        return total + (sub.cost / 12); // Monthly portion
      }
      return total;
    }, 0);
  }

  /**
   * Get next payment date based on frequency
   */
  private getNextPaymentDate(frequency: 'monthly' | 'weekly' | 'yearly'): Date {
    const date = new Date();
    if (frequency === 'monthly') {
      date.setMonth(date.getMonth() + 1);
    } else if (frequency === 'weekly') {
      date.setDate(date.getDate() + 7);
    } else if (frequency === 'yearly') {
      date.setFullYear(date.getFullYear() + 1);
    }
    return date;
  }

  /**
   * Toggle auto-pay for a subscription
   */
  async toggleAutoPay(id: string): Promise<boolean> {
    try {
      const apiSub = await subscriptionApi.toggleAutoPay(id);
      const localSub = apiToLocalSubscription(apiSub);
      this.subscriptions.set(id, localSub);
      return true;
    } catch (error) {
      console.error('Failed to toggle auto-pay:', error);
      return false;
    }
  }

  /**
   * Get payment history for a subscription
   */
  getPaymentHistory(id: string): Date[] {
    return this.paymentHistory.get(id) || [];
  }

}

/**
 * Factory: create subscription agent (contract as source of truth)
 */
export function createSubscriptionAgent(client: ThirdwebClient, chain: Chain): SubscriptionAgent {
  return new SubscriptionAgent(client, chain);
}

