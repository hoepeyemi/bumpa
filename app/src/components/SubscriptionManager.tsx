import { useState, useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import { SubscriptionAgent, Subscription, AISuggestion } from "../services/subscriptionService";
import { subscriptionApi, Payment } from "../services/subscriptionApi";
import SubscriptionCard from "./SubscriptionCard";
import AISuggestions from "./AISuggestions";
import CreateServiceForm from "./CreateServiceForm";
import PaymentHistoryItem from "./PaymentHistoryItem";
import "./SubscriptionManager.css";

interface SubscriptionManagerProps {
  subscriptionAgent: SubscriptionAgent;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export default function SubscriptionManager({
  subscriptionAgent,
  onSuccess,
  onError,
}: SubscriptionManagerProps) {
  const account = useActiveAccount();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoManageEnabled, setAutoManageEnabled] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<Map<string, Payment[]>>(new Map());
  const [loadingPayments, setLoadingPayments] = useState(false);

  useEffect(() => {
    if (account?.address) {
      subscriptionAgent.setUserAddress(account.address).then(() => {
        loadSubscriptions();
        loadSuggestions();
      });
    } else {
      setSubscriptions([]);
      setSuggestions([]);
    }
    
    // Auto-check every minute
    const interval = setInterval(() => {
      if (autoManageEnabled && account) {
        checkAndPaySubscriptions();
      }
    }, 60000); // 1 minute

    return () => clearInterval(interval);
  }, [account, autoManageEnabled]);

  const loadSubscriptions = async () => {
    if (account?.address) {
      await subscriptionAgent.loadFromAPI();
    }
    const subs = subscriptionAgent.getAllSubscriptions();
    setSubscriptions(subs);
    // Load payment history for all subscriptions
    await loadPaymentHistory(subs);
  };

  const loadPaymentHistory = async (subs: Subscription[]) => {
    if (!account?.address || subs.length === 0) return;
    
    setLoadingPayments(true);
    try {
      const paymentMap = new Map<string, Payment[]>();
      
      // Load payment history for each subscription
      await Promise.all(
        subs.map(async (sub) => {
          try {
            const payments = await subscriptionApi.getPaymentHistory(sub.id, 50);
            paymentMap.set(sub.id, payments);
          } catch (error) {
            console.error(`Error loading payment history for subscription ${sub.id}:`, error);
            paymentMap.set(sub.id, []);
          }
        })
      );
      
      setPaymentHistory(paymentMap);
    } catch (error) {
      console.error('Error loading payment history:', error);
    } finally {
      setLoadingPayments(false);
    }
  };

  const loadSuggestions = async () => {
    try {
      const aiSuggestions = await subscriptionAgent.suggestCancellations();
      setSuggestions(aiSuggestions);
    } catch (error) {
      console.error('Error loading suggestions:', error);
    }
  };

  const checkAndPaySubscriptions = async () => {
    if (!account) return;

    try {
      setLoading(true);
      const results = await subscriptionAgent.manageSubscriptions(account);
      
      const successCount = results.filter(r => r.success).length;
      if (successCount > 0) {
        onSuccess?.(`Automatically paid ${successCount} subscription${successCount > 1 ? 's' : ''}`);
        loadSubscriptions();
      }

      const failedCount = results.filter(r => !r.success).length;
      if (failedCount > 0) {
        onError?.(`Failed to pay ${failedCount} subscription${failedCount > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('Error managing subscriptions:', error);
      onError?.('Error managing subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async (id: string) => {
    if (await subscriptionAgent.removeSubscription(id)) {
      onSuccess?.('Subscription cancelled');
      await loadSubscriptions();
      loadSuggestions();
    } else {
      onError?.('Failed to cancel subscription');
    }
  };

  const handleToggleAutoPay = async (id: string) => {
    if (await subscriptionAgent.toggleAutoPay(id)) {
      onSuccess?.('Auto-pay toggled');
      await loadSubscriptions();
    } else {
      onError?.('Failed to toggle auto-pay');
    }
  };

  const handleEditSubscription = (subscription: Subscription) => {
    setEditingSubscription(subscription);
  };

  const handleUpdateSubscription = async (serviceData: {
    service: string;
    cost: number;
    frequency: 'monthly' | 'weekly' | 'yearly';
    recipientAddress: string;
    autoPay: boolean;
  }) => {
    if (!editingSubscription) return;

    try {
      setLoading(true);
      const success = await subscriptionAgent.updateSubscription(editingSubscription.id, serviceData);
      
      if (success) {
        onSuccess?.(`Service "${serviceData.service}" updated successfully!`);
        setEditingSubscription(null);
        await loadSubscriptions();
        loadSuggestions();
      } else {
        onError?.('Failed to update service');
      }
    } catch (error) {
      console.error('Error updating service:', error);
      onError?.('Failed to update service');
    } finally {
      setLoading(false);
    }
  };

  const handleManualPay = async (subscription: Subscription) => {
    if (!account) {
      onError?.('Please connect your wallet to make a payment');
      return;
    }

    try {
      setLoading(true);
      onSuccess?.(`Processing payment of $${subscription.cost.toFixed(3)} USDC to ${subscription.service}...`);
      
      const result = await subscriptionAgent.autoPaySubscription(account, subscription);
      
      if (result.success) {
        onSuccess?.(`✅ Successfully paid $${subscription.cost.toFixed(3)} USDC to ${subscription.service}. Transaction: ${result.transactionHash?.slice(0, 10)}...`);
        loadSubscriptions();
      } else {
        onError?.(result.error || 'Payment failed. Please check your USDC.e balance and try again.');
      }
    } catch (error) {
      console.error('Payment error:', error);
      onError?.(`Payment failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please ensure you have sufficient USDC.e balance.`);
    } finally {
      setLoading(false);
    }
  };

  const totalMonthlyCost = subscriptions
    .filter(sub => sub.isActive)
    .reduce((total, sub) => {
      if (sub.frequency === 'monthly') {
        return total + sub.cost;
      } else if (sub.frequency === 'weekly') {
        return total + (sub.cost * 4);
      } else if (sub.frequency === 'yearly') {
        return total + (sub.cost / 12);
      }
      return total;
    }, 0);

  const activeSubscriptions = subscriptions.filter(sub => sub.isActive);
  const dueSubscriptions = activeSubscriptions.filter(sub => {
    const now = new Date();
    return sub.nextPaymentDate <= now;
  });

  return (
    <div className="subscription-manager">
      {/* Header Stats */}
      <div className="subscription-stats">
        <div className="stat-card">
          <div className="stat-label">Active Subscriptions</div>
          <div className="stat-value">{activeSubscriptions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Monthly Cost</div>
          <div className="stat-value">${totalMonthlyCost.toFixed(3)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Due Now</div>
          <div className="stat-value warning">{dueSubscriptions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Auto-Manage</div>
          <div className="stat-value">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autoManageEnabled}
                onChange={(e) => setAutoManageEnabled(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <AISuggestions
          suggestions={suggestions}
          onCancel={(id) => {
            handleCancelSubscription(id);
          }}
        />
      )}

      {/* Actions */}
      <div className="subscription-actions">
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(true)}
          disabled={loading}
        >
          ➕ Create New Service
        </button>
        <button
          className="btn btn-primary"
          onClick={checkAndPaySubscriptions}
          disabled={loading || !account}
        >
          {loading ? 'Processing...' : '🔄 Check & Pay Due Subscriptions'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={loadSuggestions}
        >
          🤖 Refresh AI Suggestions
        </button>
      </div>

      {/* Create Service Form */}
      {showCreateForm && (
        <CreateServiceForm
          onSubmit={async (serviceData) => {
            try {
              setLoading(true);
              const newSubscription = await subscriptionAgent.addSubscription({
                service: serviceData.service,
                cost: serviceData.cost,
                frequency: serviceData.frequency,
                recipientAddress: serviceData.recipientAddress,
                isActive: true,
                autoPay: serviceData.autoPay,
              });
              
              onSuccess?.(`Service "${newSubscription.service}" created successfully!`);
              setShowCreateForm(false);
              await loadSubscriptions();
              loadSuggestions();
            } catch (error) {
              console.error('Error creating service:', error);
              onError?.(error instanceof Error ? error.message : 'Failed to create service');
            } finally {
              setLoading(false);
            }
          }}
          onCancel={() => setShowCreateForm(false)}
          loading={loading}
        />
      )}

      {/* Edit Service Form */}
      {editingSubscription && (
        <CreateServiceForm
          initialData={{
            service: editingSubscription.service,
            cost: editingSubscription.cost,
            frequency: editingSubscription.frequency,
            recipientAddress: editingSubscription.recipientAddress,
            autoPay: editingSubscription.autoPay,
          }}
          onSubmit={handleUpdateSubscription}
          onCancel={() => setEditingSubscription(null)}
          loading={loading}
        />
      )}

      {/* Subscriptions List */}
      <div className="subscriptions-section">
        <h2 className="section-title">Your Subscriptions</h2>
        {activeSubscriptions.length === 0 ? (
          <div className="empty-state card">
            <div className="empty-icon">📭</div>
            <h3>No Active Subscriptions</h3>
            <p>Add a subscription to get started with auto-payments</p>
          </div>
        ) : (
          <div className="subscriptions-grid">
            {activeSubscriptions.map((subscription) => (
              <SubscriptionCard
                key={subscription.id}
                subscription={subscription}
                onCancel={() => handleCancelSubscription(subscription.id)}
                onToggleAutoPay={() => handleToggleAutoPay(subscription.id)}
                onManualPay={() => handleManualPay(subscription)}
                onEdit={() => handleEditSubscription(subscription)}
                loading={loading}
              />
            ))}
          </div>
        )}
      </div>

      {/* Payment History Section */}
      {activeSubscriptions.length > 0 && (() => {
        // Collect all payments from all subscriptions
        const allPayments: Array<{ payment: Payment; serviceName: string }> = [];
        paymentHistory.forEach((payments, subscriptionId) => {
          const subscription = subscriptions.find(s => s.id === subscriptionId);
          if (subscription) {
            payments.forEach(payment => {
              allPayments.push({
                payment,
                serviceName: subscription.service || 'Unknown Service'
              });
            });
          }
        });

        // Sort by timestamp (newest first)
        allPayments.sort((a, b) => 
          new Date(b.payment.timestamp).getTime() - new Date(a.payment.timestamp).getTime()
        );

        if (allPayments.length === 0 && !loadingPayments) {
          return null;
        }

        return (
          <div className="payment-history-section">
            <h2 className="section-title">
              Transaction History
              {loadingPayments && <span className="loading-indicator">Loading...</span>}
            </h2>
            <div className="payment-history-list">
              {allPayments.length > 0 ? (
                allPayments.map(({ payment, serviceName }) => (
                  <PaymentHistoryItem
                    key={payment.id}
                    payment={payment}
                    serviceName={serviceName}
                  />
                ))
              ) : (
                <div className="empty-payment-history">
                  <p>No payment history available yet.</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

