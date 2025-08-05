# Webhook Handler Deployment Guide

This guide explains how to deploy the webhook handler for Stripe payments.

## Option 1: Vercel Deployment (Recommended)

1. **Create API Routes**
   Create the following files in your project:

   ```
   api/
   ├── create-checkout-session.js
   └── confirm-payment.js
   ```

2. **Install Dependencies**
   ```bash
   npm install stripe @supabase/supabase-js
   ```

3. **Environment Variables**
   Add these to your Vercel environment variables:
   ```
   STRIPE_SECRET_KEY=sk_test_your_key_here
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

## Option 2: Netlify Functions

1. **Create Functions Directory**
   ```
   netlify/functions/
   ├── create-checkout-session.js
   └── confirm-payment.js
   ```

2. **Install Dependencies**
   ```bash
   npm install stripe @supabase/supabase-js
   ```

3. **Environment Variables**
   Add to your Netlify environment variables in the dashboard.

4. **Deploy to Netlify**
   ```bash
   netlify deploy --prod
   ```

## Option 3: Express.js Server

1. **Create Server**
   ```javascript
   // server.js
   const express = require('express');
   const app = express();
   
   app.use(express.json());
   
   app.post('/api/create-checkout-session', require('./api/create-checkout-session'));
   app.post('/api/confirm-payment', require('./api/confirm-payment'));
   
   app.listen(3001, () => {
     console.log('Server running on port 3001');
   });
   ```

2. **Deploy to Heroku/Railway/Render**
   Follow the platform-specific deployment instructions.

## Stripe Configuration

1. **Get Your Stripe Keys**
   - Go to Stripe Dashboard > Developers > API Keys
   - Copy your publishable and secret keys

2. **Update Price IDs**
   In `api/create-checkout-session.js`, replace the placeholder price IDs:
   ```javascript
   const STRIPE_PRICE_IDS = {
     starter: 'price_1OqX8X2eZvKYlo2C1234567890', // Your actual price ID
     pro: 'price_1OqX8X2eZvKYlo2C1234567891',
     business: 'price_1OqX8X2eZvKYlo2C1234567892'
   };
   ```

3. **Create Products in Stripe**
   - Go to Stripe Dashboard > Products
   - Create products for each tier (Starter, Pro, Business)
   - Copy the price IDs and update the code

## Testing

1. **Test Mode**
   Use Stripe's test mode for development:
   - Test card: 4242 4242 4242 4242
   - Any future date for expiry
   - Any 3-digit CVC

2. **Webhook Testing**
   ```bash
   stripe listen --forward-to localhost:3000/api/webhook
   ```

## Production Checklist

- [ ] Update Stripe keys to live mode
- [ ] Update price IDs to live products
- [ ] Set up webhook endpoint in Stripe Dashboard
- [ ] Test with real payment methods
- [ ] Monitor webhook delivery in Stripe Dashboard

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure your API routes handle CORS properly
   - Add appropriate headers for cross-origin requests

2. **Environment Variables**
   - Double-check all environment variables are set
   - Verify Stripe keys are correct

3. **Price ID Errors**
   - Ensure price IDs exist in your Stripe account
   - Check that prices are active and in the correct currency

4. **Webhook Not Received**
   - Verify webhook endpoint URL is correct
   - Check that events are selected in Stripe Dashboard
   - Monitor webhook delivery logs 