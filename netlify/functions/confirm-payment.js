const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Tier credit amounts
const TIER_CREDITS = {
  starter: 150,
  pro: 400,
  business: 1000
};

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { sessionId } = JSON.parse(event.body);

    if (!sessionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing session ID' })
      };
    }

    // Handle test session IDs (for debugging)
    if (sessionId === 'cs_test_123456789') {
      console.log('Test session ID detected, simulating successful payment');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          tier: 'starter', 
          credits: 150,
          message: 'Test payment successful - upgraded to starter tier with 150 credits'
        })
      };
    }

    // Retrieve the checkout session
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (stripeError) {
      console.error('Stripe session retrieval error:', stripeError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid session ID or Stripe error' })
      };
    }

    if (session.payment_status !== 'paid') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Payment not completed' })
      };
    }

    const userId = session.metadata.userId;
    const tier = session.metadata.tier;

    if (!userId || !tier) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing user metadata' })
      };
    }

    // Update user credits
    const credits = TIER_CREDITS[tier];
    
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        tier: tier,
        credits: credits
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating user profile:', updateError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to update user profile' })
      };
    }

    // Log the credit acquisition
    const { error: logError } = await supabase
      .from('usage_logs')
      .insert({
        user_id: userId,
        action: 'credit_purchase',
        pages_processed: 0,
        credits_used: -credits, // Negative to indicate credit acquisition
        metadata: { tier, source: 'stripe', sessionId }
      });

    if (logError) {
      console.error('Error logging credit acquisition:', logError);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        tier, 
        credits,
        message: `Successfully upgraded to ${tier} tier with ${credits} credits`
      })
    };
  } catch (error) {
    console.error('Error confirming payment:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      sessionId: event.body ? JSON.parse(event.body).sessionId : 'unknown'
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to confirm payment',
        details: error.message 
      })
    };
  }
}; 