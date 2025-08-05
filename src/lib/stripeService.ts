import { TIER_CONFIG } from './supabase';

// Stripe plan configuration
export const STRIPE_PLANS = {
  starter: {
    name: 'Starter',
    checkoutUrl: 'https://buy.stripe.com/test_dRmdRbcurfW97JAdhBgUM00',
    tier: 'starter' as const,
    credits: TIER_CONFIG.starter.credits,
    price: '$29/month'
  },
  pro: {
    name: 'Pro', 
    checkoutUrl: 'https://buy.stripe.com/test_28EaEZ7a7fW9aVM0uPgUM01',
    tier: 'pro' as const,
    credits: TIER_CONFIG.pro.credits,
    price: '$69/month'
  },
  business: {
    name: 'Business',
    checkoutUrl: 'https://buy.stripe.com/test_eVq8wR66325j3tk4L5gUM02', 
    tier: 'business' as const,
    credits: TIER_CONFIG.business.credits,
    price: '$149/month'
  }
} as const;

export type StripePlanId = keyof typeof STRIPE_PLANS;

export class StripeService {
  private static instance: StripeService;

  static getInstance(): StripeService {
    if (!StripeService.instance) {
      StripeService.instance = new StripeService();
    }
    return StripeService.instance;
  }

  /**
   * Redirect user to Stripe checkout for the specified plan
   */
  async redirectToCheckout(planId: StripePlanId, userId?: string): Promise<void> {
    const plan = STRIPE_PLANS[planId];
    if (!plan) {
      throw new Error(`Invalid plan ID: ${planId}`);
    }

    // Create the checkout URL with return URLs
    const returnUrl = new URL(window.location.origin);
    returnUrl.searchParams.set('payment_success', 'true');
    returnUrl.searchParams.set('plan', planId);
    if (userId) {
      returnUrl.searchParams.set('user_id', userId);
    }

    const cancelUrl = new URL(window.location.origin);
    cancelUrl.searchParams.set('payment_cancelled', 'true');

    // For testing, we'll use the provided URLs directly
    // In production, you might want to add customer_id and other metadata
    let checkoutUrl = plan.checkoutUrl;
    
    // Add return URL parameters if Stripe supports them (depends on your Stripe setup)
    try {
      const url = new URL(checkoutUrl);
      url.searchParams.set('success_url', returnUrl.toString());
      url.searchParams.set('cancel_url', cancelUrl.toString());
      checkoutUrl = url.toString();
    } catch (error) {
      // If URL parsing fails, use the original URL
      console.warn('Could not add return URLs to Stripe checkout URL:', error);
    }

    // Redirect to Stripe checkout
    window.location.href = checkoutUrl;
  }

  /**
   * Get plan details by ID
   */
  getPlan(planId: StripePlanId) {
    return STRIPE_PLANS[planId];
  }

  /**
   * Get all available plans
   */
  getAllPlans() {
    return Object.entries(STRIPE_PLANS).map(([id, plan]) => ({
      id: id as StripePlanId,
      ...plan
    }));
  }

  /**
   * Check if current URL indicates a successful payment
   */
  checkPaymentSuccess(): { success: boolean; planId?: StripePlanId; userId?: string } {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Check for our custom success parameter
    if (urlParams.get('payment_success') === 'true') {
      const planId = urlParams.get('plan') as StripePlanId;
      const userId = urlParams.get('user_id') || undefined;
      
      if (planId && STRIPE_PLANS[planId]) {
        return { success: true, planId, userId };
      }
      
      // Even without plan info, it's still a success
      return { success: true };
    }

    // Check for payment cancelled
    if (urlParams.get('payment_cancelled') === 'true') {
      return { success: false };
    }

    // Also check for Stripe's standard session_id parameter (fallback)
    const sessionId = urlParams.get('session_id');
    if (sessionId) {
      return { success: true };
    }

    return { success: false };
  }

  /**
   * Clear payment parameters from URL
   */
  clearPaymentParams(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('payment_success');
    url.searchParams.delete('payment_cancelled');
    url.searchParams.delete('plan');
    url.searchParams.delete('user_id');
    url.searchParams.delete('session_id');
    
    window.history.replaceState({}, document.title, url.toString());
  }
}

export const stripeService = StripeService.getInstance();