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

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing session ID' });
    }

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    const userId = session.metadata.userId;
    const tier = session.metadata.tier;

    if (!userId || !tier) {
      return res.status(400).json({ error: 'Missing user metadata' });
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
      return res.status(500).json({ error: 'Failed to update user profile' });
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

    res.status(200).json({ 
      success: true, 
      tier, 
      credits,
      message: `Successfully upgraded to ${tier} tier with ${credits} credits`
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
}; 