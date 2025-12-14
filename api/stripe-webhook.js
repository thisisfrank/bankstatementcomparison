// Stripe webhook handler for processing successful payments
// This will be deployed as a Netlify function

const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Tier configurations (matches frontend)
const TIER_CONFIG = {
  starter: {
    name: 'Starter',
    credits: 150,
    tier: 'starter'
  },
  pro: {
    name: 'Pro',
    credits: 400,
    tier: 'pro'
  },
  business: {
    name: 'Business',
    credits: 1000,
    tier: 'business'
  }
};

// Map Stripe checkout URLs to plans
const STRIPE_URL_TO_PLAN = {
  'https://buy.stripe.com/test_dRmdRbcurfW97JAdhBgUM00': 'starter',
  'https://buy.stripe.com/test_28EaEZ7a7fW9aVM0uPgUM01': 'pro',
  'https://buy.stripe.com/test_eVq8wR66325j3tk4L5gUM02': 'business'
};

exports.handler = async (event, context) => {
  console.log('Webhook received:', {
    method: event.httpMethod,
    headers: event.headers,
    body: event.body ? event.body.substring(0, 200) : 'No body'
  });

  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Get the raw body for Stripe signature verification
    const body = event.body;
    const signature = event.headers['stripe-signature'];

    console.log('Processing webhook with signature:', signature ? 'present' : 'missing');

    // Verify the webhook signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('Missing STRIPE_WEBHOOK_SECRET environment variable');
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Webhook secret not configured' }),
      };
    }

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }),
      };
    }

    console.log('Stripe event type:', stripeEvent.type);
    console.log('Stripe event data:', JSON.stringify(stripeEvent.data, null, 2));

    // Handle the checkout.session.completed event
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      
      console.log('Processing completed checkout session:', session.id);
      
      // Extract customer information
      const customerEmail = session.customer_details?.email;
      const sessionId = session.id;
      
      // For testing with your URLs, we'll need to determine the plan differently
      // Since the provided URLs don't include price IDs, we'll use metadata or other methods
      let planId = 'starter'; // Default
      
      // Check if there's a price in the session
      if (session.amount_total) {
        // Map amount to plan (amounts in cents)
        const amount = session.amount_total;
        if (amount === 2900) { // $29
          planId = 'starter';
        } else if (amount === 6900) { // $69
          planId = 'pro';
        } else if (amount === 14900) { // $149
          planId = 'business';
        }
      }

      // Try to find user by email
      let userId = null;
      if (customerEmail) {
        console.log('Looking for user with email:', customerEmail);
        
        // First try to find an existing user with this email
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        
        if (authError) {
          console.error('Error fetching auth users:', authError);
        } else {
          const user = authUsers.users.find(u => u.email === customerEmail);
          if (user) {
            userId = user.id;
            console.log('Found existing user:', userId);
          }
        }
      }

      if (!userId) {
        console.log('No user found, creating anonymous upgrade record');
        // For anonymous users or if we can't find the user,
        // we could store the session info and let them claim it later
        // For now, we'll just log it
        console.log('Would need to handle anonymous payment for session:', sessionId);
        
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            received: true, 
            message: 'Payment recorded but no user account found' 
          }),
        };
      }

      // Update user's tier and credits
      const tierConfig = TIER_CONFIG[planId];
      if (!tierConfig) {
        console.error('Invalid plan ID:', planId);
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Invalid plan' }),
        };
      }

      console.log(`Upgrading user ${userId} to ${planId} tier with ${tierConfig.credits} credits`);

      // Update user profile in Supabase
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          tier: tierConfig.tier,
          credits: tierConfig.credits
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Error updating user profile:', updateError);
        return {
          statusCode: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to update user profile' }),
        };
      }

      // Log the credit purchase
      const { error: logError } = await supabase
        .from('usage_logs')
        .insert({
          user_id: userId,
          session_id: null,
          action: 'credit_purchase',
          pages_processed: 0,
          credits_used: -tierConfig.credits, // Negative because we're adding credits
        });

      if (logError) {
        console.error('Error logging credit purchase:', logError);
        // Don't fail the whole operation for logging errors
      }

      console.log(`Successfully upgraded user ${userId} to ${planId}`);

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ 
          received: true, 
          userId, 
          planId, 
          credits: tierConfig.credits 
        }),
      };
    }

    // Handle other event types if needed
    console.log('Unhandled event type:', stripeEvent.type);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ received: true }),
    };

  } catch (error) {
    console.error('Webhook error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ 
        error: 'Webhook handler failed',
        message: error.message 
      }),
    };
  }
};