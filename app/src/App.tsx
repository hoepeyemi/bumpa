import { useState } from "react";
import "./App.css";
import { useNotificationHelpers } from "./contexts/NotificationContext";
import { NotificationButton } from "./components/NotificationButton";
import { NotificationToasts } from "./components/NotificationCenter";
import SubscriptionManager from "./components/SubscriptionManager";
import RevenueAnalytics from "./pages/RevenueAnalytics";
import USDCBalance from "./components/USDCBalance";

import {
  ThirdwebClient,
} from "thirdweb";
import { ConnectButton } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { FLOW_TESTNET } from "./services/x402PaymentService";
import { createSubscriptionAgent, SubscriptionAgent } from "./services/subscriptionService";


// custodial wallets for thirdweb
const wallets = [
  inAppWallet({
    auth: {
      options: ["google", "email", "passkey", "phone"],
    },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("io.rabby"),
  createWallet("com.trustwallet.app"),
  createWallet("global.safe"),
];

interface AppProps {
  thirdwebClient: ThirdwebClient;
}

export default function App({ thirdwebClient }: AppProps) {
  const { notifySuccess, notifyError } = useNotificationHelpers();
  const [activeView, setActiveView] = useState<'subscriptions' | 'analytics'>('subscriptions');

  // Initialize subscription agent (contract as source of truth)
  const [subscriptionAgent] = useState<SubscriptionAgent>(() => 
    createSubscriptionAgent(thirdwebClient, FLOW_TESTNET)
  );

  return (
    <div className="app">
      {/* Toast Notifications */}
      <NotificationToasts />
      
      {/* Modern Header */}
      <header className="header">
        <div className="header-container">
          <div className="header-logo">
            <h1>🤖 Smart Subscription Manager</h1>
          </div>
          <div className="header-actions">
            <NotificationButton />
            <USDCBalance client={thirdwebClient} />
            <ConnectButton
              client={thirdwebClient}
              wallets={wallets}
              chain={FLOW_TESTNET}
            />
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="main-nav">
        <button
          className={activeView === 'subscriptions' ? 'active' : ''}
          onClick={() => setActiveView('subscriptions')}
        >
          📋 Subscriptions
        </button>
        <button
          className={activeView === 'analytics' ? 'active' : ''}
          onClick={() => setActiveView('analytics')}
        >
          📊 Analytics
        </button>
      </div>

      <div className="main-content">
        <div className="tab-content">
          {activeView === 'subscriptions' ? (
            <SubscriptionManager
              subscriptionAgent={subscriptionAgent}
              onSuccess={(message) => {
                notifySuccess('Success', message);
              }}
              onError={(message) => {
                notifyError('Error', message);
              }}
            />
          ) : (
            <RevenueAnalytics />
          )}
        </div>
      </div>
    </div>
  );
}
