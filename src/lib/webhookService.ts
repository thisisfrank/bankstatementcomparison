import { supabase } from './supabase';

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      customer?: string;
      subscription?: string;
      metadata?: {
        user_id?: string;
        tier?: string;
      };
    };
  };
}

export class WebhookService {
  private static instance: WebhookService;

  static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  // Handle Stripe webhook events
  async handleWebhook(event: StripeWebhookEvent): Promise<{ success: boolean; error?: string }> {
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          return await this.handleCheckoutCompleted(event);
        case 'invoice.payment_succeeded':
          return await this.handlePaymentSucceeded(event);
        case 'customer.subscription.created':
          return await this.handleSubscriptionCreated(event);
        case 'customer.subscription.updated':
          return await this.handleSubscriptionUpdated(event);
        default:
          console.log(`Unhandled event type: ${event.type}`);
          return { success: true };
      }
    } catch (error: any) {
      console.error('Webhook handling error:', error);
      return { success: false, error: error.message };
    }
  }

  // Handle successful checkout completion
  private async handleCheckoutCompleted(event: StripeWebhookEvent): Promise<{ success: boolean; error?: string }> {
    try {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const tier = session.metadata?.tier;

      if (!userId || !tier) {
        return { success: false, error: 'Missing user_id or tier in metadata' };
      }

      // Update user tier and credits
      const credits = this.getCreditsForTier(tier);
      
      const { error } = await supabase
        .from('profiles')
        .update({
          tier: tier as any,
          credits: credits
        })
        .eq('id', userId);

      if (error) {
        console.error('Error updating user profile:', error);
        return { success: false, error: 'Failed to update user profile' };
      }

      // Log the credit acquisition
      await this.logCreditAcquisition(userId, credits, tier);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Handle successful payment
  private async handlePaymentSucceeded(event: StripeWebhookEvent): Promise<{ success: boolean; error?: string }> {
    try {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;

      if (!subscriptionId) {
        return { success: false, error: 'No subscription found in invoice' };
      }

      // Get subscription details to determine tier
      const tier = await this.getTierFromSubscription(subscriptionId);
      if (!tier) {
        return { success: false, error: 'Could not determine tier from subscription' };
      }

      // Find user by subscription ID (you might need to store this mapping)
      const userId = await this.getUserIdFromSubscription(subscriptionId);
      if (!userId) {
        return { success: false, error: 'Could not find user for subscription' };
      }

      // Update user credits
      const credits = this.getCreditsForTier(tier);
      
      const { error } = await supabase
        .from('profiles')
        .update({
          credits: credits
        })
        .eq('id', userId);

      if (error) {
        console.error('Error updating user credits:', error);
        return { success: false, error: 'Failed to update user credits' };
      }

      // Log the credit acquisition
      await this.logCreditAcquisition(userId, credits, tier);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Handle subscription creation
  private async handleSubscriptionCreated(event: StripeWebhookEvent): Promise<{ success: boolean; error?: string }> {
    try {
      const subscription = event.data.object;
      const userId = subscription.metadata?.user_id;
      const tier = subscription.metadata?.tier;

      if (!userId || !tier) {
        return { success: false, error: 'Missing user_id or tier in metadata' };
      }

      // Store subscription mapping for future reference
      await this.storeSubscriptionMapping(subscription.id, userId, tier);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Handle subscription updates
  private async handleSubscriptionUpdated(event: StripeWebhookEvent): Promise<{ success: boolean; error?: string }> {
    try {
      const subscription = event.data.object;
      const userId = await this.getUserIdFromSubscription(subscription.id);
      
      if (!userId) {
        return { success: false, error: 'Could not find user for subscription' };
      }

      // Update user tier based on subscription
      const tier = await this.getTierFromSubscription(subscription.id);
      if (tier) {
        const credits = this.getCreditsForTier(tier);
        
        const { error } = await supabase
          .from('profiles')
          .update({
            tier: tier as any,
            credits: credits
          })
          .eq('id', userId);

        if (error) {
          console.error('Error updating user tier:', error);
          return { success: false, error: 'Failed to update user tier' };
        }
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Get credits for a given tier
  private getCreditsForTier(tier: string): number {
    const tierCredits = {
      starter: 150,
      pro: 400,
      business: 1000
    };
    return tierCredits[tier as keyof typeof tierCredits] || 0;
  }

  // Get tier from subscription (you'll need to implement this based on your Stripe setup)
  private async getTierFromSubscription(subscriptionId: string): Promise<string | null> {
    // This would typically involve calling Stripe API to get subscription details
    // For now, we'll return a default tier
    return 'starter';
  }

  // Get user ID from subscription (you'll need to implement this based on your data structure)
  private async getUserIdFromSubscription(subscriptionId: string): Promise<string | null> {
    // This would typically involve querying your database for the subscription mapping
    // For now, we'll return null
    return null;
  }

  // Store subscription mapping
  private async storeSubscriptionMapping(subscriptionId: string, userId: string, tier: string): Promise<void> {
    // Store the mapping in your database for future reference
    // This is just a placeholder - implement based on your data structure
    console.log(`Storing subscription mapping: ${subscriptionId} -> ${userId} (${tier})`);
  }

  // Log credit acquisition
  private async logCreditAcquisition(userId: string, credits: number, tier: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('usage_logs')
        .insert({
          user_id: userId,
          action: 'credit_purchase',
          pages_processed: 0,
          credits_used: -credits, // Negative to indicate credit acquisition
          metadata: { tier, source: 'stripe' }
        });

      if (error) {
        console.error('Error logging credit acquisition:', error);
      }
    } catch (error) {
      console.error('Error logging credit acquisition:', error);
    }
  }
}

export const webhookService = WebhookService.getInstance(); 