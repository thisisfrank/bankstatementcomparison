import React from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { StripeService } from '../lib/stripeService';

interface StripeCheckoutProps {
  isVisible: boolean;
  onClose: () => void;
  isDark: boolean;
  selectedTier: 'starter' | 'pro' | 'business';
}

const TIER_INFO = {
  starter: {
    name: 'Starter',
    price: '$29/month',
    credits: 150,
    description: 'Perfect for individuals'
  },
  pro: {
    name: 'Pro',
    price: '$69/month',
    credits: 400,
    description: 'Great for small teams'
  },
  business: {
    name: 'Business',
    price: '$149/month',
    credits: 1000,
    description: 'Enterprise solution'
  }
};

export function StripeCheckout({ isVisible, onClose, isDark, selectedTier }: StripeCheckoutProps) {
  const [isRedirecting, setIsRedirecting] = React.useState(false);

  const handleCheckout = async () => {
    setIsRedirecting(true);
    
    try {
      // Create dynamic checkout session
      await StripeService.createCheckoutSession(selectedTier);
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to create checkout session. Please try again.');
      setIsRedirecting(false);
    }
  };

  if (!isVisible) return null;

  const tierInfo = TIER_INFO[selectedTier];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`rounded-xl max-w-md w-full p-6 relative ${
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      } border shadow-lg`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            Upgrade to {tierInfo.name}
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className={`p-4 rounded-lg border ${
            isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="text-center">
              <div className={`text-2xl font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                {tierInfo.price}
              </div>
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {tierInfo.credits} credits per month
              </div>
              <div className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                {tierInfo.description}
              </div>
            </div>
          </div>

          <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>Unlimited bank statement comparisons</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>Detailed transaction analysis</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>PDF & CSV export</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>Priority support</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            disabled={isRedirecting}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              isRedirecting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isRedirecting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Redirecting to Stripe...
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5" />
                Upgrade to {tierInfo.name}
              </>
            )}
          </button>

          <div className={`text-xs text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Secure payment powered by Stripe. You'll be redirected to complete your purchase.
          </div>
        </div>
      </div>
    </div>
  );
} 