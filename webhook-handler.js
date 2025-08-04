// Webhook handler for Stripe events
// This can be deployed as a serverless function (Vercel, Netlify, etc.)

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = 'http://127.0.0.1:54321'; // Replace with your Supabase URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'; // Replace with your Supabase anon key
const supabase = createClient(supabaseUrl, supabaseKey);

// Tier configurations
const TIER_CONFIG = {
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

// Get credits for a given tier
function getCreditsForTier(tier) {
  return TIER_CONFIG[tier]?.credits || 0;
}

// Log credit acquisition
async function logCreditAcquisition(userId, credits, tier) {
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

// Handle successful checkout completion
async function handleCheckoutCompleted(session) {
  try {
    const userId = session.metadata?.user_id;
    const tier = session.metadata?.tier;

    if (!userId || !tier) {
      console.error('Missing user_id or tier in metadata');
      return { success: false, error: 'Missing user_id or tier in metadata' };
    }

    // Update user tier and credits
    const credits = getCreditsForTier(tier);
    
    const { error } = await supabase
      .from('profiles')
      .update({
        tier: tier,
        credits: credits
      })
      .eq('id', userId);

    if (error) {
      console.error('Error updating user profile:', error);
      return { success: false, error: 'Failed to update user profile' };
    }

    // Log the credit acquisition
    await logCreditAcquisition(userId, credits, tier);

    return { success: true };
  } catch (error) {
    console.error('Error handling checkout completed:', error);
    return { success: false, error: error.message };
  }
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
  try {
    const subscriptionId = invoice.subscription;

    if (!subscriptionId) {
      console.error('No subscription found in invoice');
      return { success: false, error: 'No subscription found in invoice' };
    }

    // Get subscription details to determine tier
    const tier = await getTierFromSubscription(subscriptionId);
    if (!tier) {
      console.error('Could not determine tier from subscription');
      return { success: false, error: 'Could not determine tier from subscription' };
    }

    // Find user by subscription ID
    const userId = await getUserIdFromSubscription(subscriptionId);
    if (!userId) {
      console.error('Could not find user for subscription');
      return { success: false, error: 'Could not find user for subscription' };
    }

    // Update user credits
    const credits = getCreditsForTier(tier);
    
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
    await logCreditAcquisition(userId, credits, tier);

    return { success: true };
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
    return { success: false, error: error.message };
  }
}

// Get tier from subscription (implement based on your Stripe setup)
async function getTierFromSubscription(subscriptionId) {
  // This would typically involve calling Stripe API to get subscription details
  // For now, we'll return a default tier
  return 'starter';
}

// Get user ID from subscription (implement based on your data structure)
async function getUserIdFromSubscription(subscriptionId) {
  // This would typically involve querying your database for the subscription mapping
  // For now, we'll return null
  return null;
}

// Main webhook handler
exports.handler = async (event, context) => {
  try {
    // Verify the webhook signature (you should implement this)
    // const signature = event.headers['stripe-signature'];
    // const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    // const stripeEvent = stripe.webhooks.constructEvent(event.body, signature, webhookSecret);

    // For now, we'll parse the event directly
    const stripeEvent = JSON.parse(event.body);

    console.log('Received webhook event:', stripeEvent.type);

    let result;

    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        result = await handleCheckoutCompleted(stripeEvent.data.object);
        break;
      case 'invoice.payment_succeeded':
        result = await handlePaymentSucceeded(stripeEvent.data.object);
        break;
      case 'customer.subscription.created':
        console.log('Subscription created:', stripeEvent.data.object.id);
        result = { success: true };
        break;
      case 'customer.subscription.updated':
        console.log('Subscription updated:', stripeEvent.data.object.id);
        result = { success: true };
        break;
      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
        result = { success: true };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
}; 