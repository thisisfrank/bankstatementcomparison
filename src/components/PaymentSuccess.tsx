import React, { useEffect, useState } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { StripeService } from '../lib/stripeService';

interface PaymentSuccessProps {
  isVisible: boolean;
  onClose: () => void;
  isDark: boolean;
}

export function PaymentSuccess({ isVisible, onClose, isDark }: PaymentSuccessProps) {
  const [isConfirming, setIsConfirming] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<{
    tier: string;
    credits: number;
  } | null>(null);

  useEffect(() => {
    if (isVisible) {
      confirmPayment();
    }
  }, [isVisible]);

  const confirmPayment = async () => {
    try {
      // Get session ID from URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session_id');

      if (!sessionId) {
        setError('No session ID found in URL');
        setIsConfirming(false);
        return;
      }

      // Confirm payment with backend
      const result = await StripeService.handlePaymentSuccess(sessionId);
      
      setSuccess(true);
      setPaymentDetails({
        tier: result.tier,
        credits: result.credits
      });
    } catch (error: any) {
      console.error('Error confirming payment:', error);
      setError(error.message || 'Failed to confirm payment');
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`rounded-xl max-w-md w-full p-6 relative ${
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      } border shadow-lg`}>
        <div className="text-center">
          {isConfirming ? (
            <>
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
              <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                Confirming Payment...
              </h2>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Please wait while we verify your payment and update your account.
              </p>
            </>
          ) : success ? (
            <>
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600" />
              <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                Payment Successful!
              </h2>
              {paymentDetails && (
                <div className={`p-4 rounded-lg border mb-4 ${
                  isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                }`}>
                  <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    You've been upgraded to <strong>{paymentDetails.tier}</strong> tier
                  </p>
                  <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    Your account now has <strong>{paymentDetails.credits} credits</strong>
                  </p>
                </div>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 px-4 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Continue to App
              </button>
            </>
          ) : (
            <>
              <div className="h-12 w-12 mx-auto mb-4 text-red-600">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                Payment Error
              </h2>
              <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {error || 'There was an error processing your payment.'}
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 px-4 rounded-lg font-medium bg-gray-600 hover:bg-gray-700 text-white transition-colors"
              >
                Go Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
} 