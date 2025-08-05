# Stripe Integration Setup

This document outlines the Stripe payment integration for the Bank Statement Comparison app.

## Overview

The app uses Stripe's hosted checkout pages with webhook notifications to handle subscription upgrades. Here's the flow:

```
User clicks "Upgrade" → Redirects to Stripe Checkout → User pays → Stripe sends webhook → User tier updated in Supabase
```

## Stripe Configuration

### 1. Checkout URLs
The app uses the following Stripe checkout URLs provided by the user:

- **Starter Plan**: `https://buy.stripe.com/test_dRmdRbcurfW97JAdhBgUM00`
- **Pro Plan**: `https://buy.stripe.com/test_28EaEZ7a7fW9aVM0uPgUM01`  
- **Business Plan**: `https://buy.stripe.com/test_eVq8wR66325j3tk4L5gUM02`

### 2. Environment Variables
Add these to your Netlify environment variables:

```env
# Required for webhook handler
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Already configured
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 3. Webhook Endpoint
The webhook handler is deployed as a Netlify function at:
```
https://your-app.netlify.app/.netlify/functions/stripe-webhook
```

Configure this URL in your Stripe dashboard as a webhook endpoint for the `checkout.session.completed` event.

## Testing

### Test Cards
Use Stripe's test card numbers:
- **Success**: `4242 4242 4242 4242`
- **Requires authentication**: `4000 0025 0000 3155`
- **Declined**: `4000 0000 0000 0002`

### Test Flow
1. Click "Upgrade" on any paid plan
2. Complete payment with test card `4242 4242 4242 4242`
3. You'll be redirected back to the app
4. Your account should be upgraded with the appropriate credits

## Implementation Details

### Frontend (`stripeService.ts`)
- Maps plan names to Stripe checkout URLs
- Handles redirect to Stripe checkout
- Detects payment success on return
- Clears URL parameters after processing

### Backend (`api/stripe-webhook.js`)
- Netlify function that handles Stripe webhooks
- Processes `checkout.session.completed` events
- Updates user tier and credits in Supabase
- Logs credit purchases for tracking

### User Flow Integration
- Pricing page redirects to Stripe checkout
- Settings page has upgrade functionality
- Paywall modal redirects to pricing page
- Payment success is detected and user data refreshed

## Plan Mapping

| Plan | Price | Credits | Stripe URL |
|------|-------|---------|------------|
| Starter | $29/month | 150 pages | `...dRmdRbcurfW97JAdhBgUM00` |
| Pro | $69/month | 400 pages | `...28EaEZ7a7fW9aVM0uPgUM01` |
| Business | $149/month | 1,000 pages | `...eVq8wR66325j3tk4L5gUM02` |

## Deployment Notes

1. The webhook function will be automatically deployed with your Netlify site
2. Make sure to configure the webhook URL in your Stripe dashboard
3. Set all required environment variables in Netlify
4. Test the complete flow in Stripe's test mode first

## Security

- Webhook signature verification should be enabled in production
- Use Supabase service role key only on server-side (webhook handler)
- Never expose Stripe secret keys in frontend code
- All checkout URLs are hosted by Stripe (secure by default)
- Environment variables properly configured ✅