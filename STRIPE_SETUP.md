# Stripe Integration Setup

This guide explains how to set up the Stripe integration for the bank statement comparison app.

## Overview

The app now uses Stripe's hosted checkout pages for handling payments. When users upgrade their tier, they are redirected to Stripe's checkout page, and upon successful payment, their credits are updated via webhooks.

## Stripe Checkout URLs

The following checkout URLs are configured for each tier:

- **Starter**: https://buy.stripe.com/test_dRmdRbcurfW97JAdhBgUM00
- **Pro**: https://buy.stripe.com/test_28EaEZ7a7fW9aVM0uPgUM01  
- **Business**: https://buy.stripe.com/test_eVq8wR66325j3tk4L5gUM02

## Webhook Setup

### 1. Deploy the Webhook Handler

The `webhook-handler.js` file contains a serverless function that handles Stripe webhook events. You can deploy this to:

- **Vercel**: Create a `api/webhook.js` file with the handler code
- **Netlify**: Create a `functions/webhook.js` file with the handler code
- **AWS Lambda**: Use the handler code as a Lambda function

### 2. Configure Stripe Webhooks

In your Stripe Dashboard:

1. Go to **Developers > Webhooks**
2. Click **Add endpoint**
3. Set the endpoint URL to your deployed webhook handler (e.g., `https://your-domain.com/api/webhook`)
4. Select the following events to listen for:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
5. Save the webhook endpoint

### 3. Update Environment Variables

In your webhook handler, update the Supabase configuration:

```javascript
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';
```

## How It Works

### 1. User Flow

1. User clicks "Upgrade" on a paid plan
2. User is redirected to the appropriate Stripe checkout URL
3. User completes payment on Stripe's hosted page
4. Stripe sends a webhook to your server
5. Webhook handler updates the user's tier and credits in Supabase
6. User returns to the app with updated credits

### 2. Webhook Processing

The webhook handler processes these events:

- **`checkout.session.completed`**: Updates user tier and credits immediately after payment
- **`invoice.payment_succeeded`**: Refreshes credits on recurring payments
- **`customer.subscription.created`**: Logs new subscription creation
- **`customer.subscription.updated`**: Updates user tier if subscription changes

### 3. Credit Updates

When a payment is successful, the webhook handler:

1. Extracts user ID and tier from the webhook data
2. Calculates the appropriate credit amount for the tier
3. Updates the user's profile in Supabase
4. Logs the credit acquisition in the usage_logs table

## Tier Configuration

The credit amounts for each tier are:

- **Starter**: 150 credits/month ($29)
- **Pro**: 400 credits/month ($69)  
- **Business**: 1000 credits/month ($149)

## Testing

### 1. Test Mode

The current checkout URLs use Stripe's test mode. For production:

1. Create new checkout sessions in your Stripe Dashboard
2. Update the URLs in `src/components/StripeCheckout.tsx`
3. Use live mode webhook endpoints

### 2. Webhook Testing

You can test webhooks using Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhook
```

### 3. Test Payments

Use Stripe's test card numbers:
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002

## Security Considerations

1. **Webhook Signature Verification**: Implement signature verification in production
2. **Environment Variables**: Store sensitive keys securely
3. **Error Handling**: Implement proper error handling and logging
4. **Idempotency**: Ensure webhook handlers are idempotent

## Troubleshooting

### Common Issues

1. **Webhook not received**: Check endpoint URL and event selection
2. **User credits not updated**: Verify Supabase connection and user ID
3. **Checkout redirect fails**: Ensure checkout URLs are correct

### Debugging

1. Check webhook logs in your deployment platform
2. Monitor Stripe Dashboard for webhook delivery status
3. Verify Supabase database updates
4. Check browser console for frontend errors

## Next Steps

1. Deploy the webhook handler to your preferred platform
2. Configure Stripe webhooks in the dashboard
3. Test the complete payment flow
4. Switch to live mode for production
5. Monitor webhook delivery and error rates 