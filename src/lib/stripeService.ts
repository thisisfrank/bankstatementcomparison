import { supabase } from './supabase';

const STRIPE_SECRET_KEY = import.meta.env.VITE_STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// Stripe product/price IDs for each tier
const STRIPE_PRICE_IDS = {
  starter: 'price_starter_id', // Replace with your actual Stripe price IDs
  pro: 'price_pro_id',
  business: 'price_business_id'
};

export class StripeService {
  static async createCheckoutSession(tier: 'starter' | 'pro' | 'business', userId: string) {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create checkout session via your backend API
      const response = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tier,
          userId: user.id,
          successUrl: `${window.location.origin}/payment-success`,
          cancelUrl: `${window.location.origin}/pricing`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { sessionId } = await response.json();
      
      // Redirect to Stripe Checkout
      const stripe = (window as any).Stripe(STRIPE_PUBLISHABLE_KEY);
      const { error } = await stripe.redirectToCheckout({ sessionId });
      
      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  }

  static async handlePaymentSuccess(sessionId: string) {
    try {
      const response = await fetch('/.netlify/functions/confirm-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId })
      });

      if (!response.ok) {
        throw new Error('Failed to confirm payment');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error confirming payment:', error);
      throw error;
    }
  }
} 