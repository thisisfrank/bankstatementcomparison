# Deployment Options for Stripe Webhook Handler

You have several options to deploy your webhook handler. Here are the easiest ones:

## Option 1: Netlify Functions (Recommended - Free & Easy)

### Setup:
1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Deploy:**
   ```bash
   netlify deploy --prod
   ```

3. **Set Environment Variables in Netlify Dashboard:**
   - `STRIPE_SECRET_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

### Benefits:
- ✅ Completely free
- ✅ No account required for basic usage
- ✅ Automatic HTTPS
- ✅ Global CDN

---

## Option 2: Railway (Free Tier Available)

### Setup:
1. **Create account at railway.app**
2. **Connect your GitHub repo**
3. **Railway will auto-detect and deploy**

### Environment Variables:
Set these in Railway dashboard:
- `STRIPE_SECRET_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### Benefits:
- ✅ Free tier available
- ✅ Auto-deploys from Git
- ✅ Built-in monitoring

---

## Option 3: Render (Free Tier Available)

### Setup:
1. **Create account at render.com**
2. **Connect your GitHub repo**
3. **Select "Web Service"**
4. **Set build command:** `npm install`
5. **Set start command:** `node server.js`

### Environment Variables:
Set in Render dashboard:
- `STRIPE_SECRET_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### Benefits:
- ✅ Free tier available
- ✅ Auto-deploys from Git
- ✅ Built-in SSL

---

## Option 4: Heroku (Free Tier Discontinued)

### Setup:
1. **Install Heroku CLI:**
   ```bash
   npm install -g heroku
   ```

2. **Create app:**
   ```bash
   heroku create your-app-name
   ```

3. **Deploy:**
   ```bash
   git push heroku main
   ```

4. **Set environment variables:**
   ```bash
   heroku config:set STRIPE_SECRET_KEY=your_key
   heroku config:set SUPABASE_URL=your_url
   heroku config:set SUPABASE_ANON_KEY=your_key
   ```

---

## Option 5: Local Development (For Testing)

### Setup:
1. **Start the server:**
   ```bash
   node server.js
   ```

2. **Use ngrok for webhook testing:**
   ```bash
   npm install -g ngrok
   ngrok http 3001
   ```

3. **Update your frontend URLs to point to localhost:3001**

---

## Quick Start with Netlify (Recommended)

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify:**
   ```bash
   netlify login
   ```

3. **Deploy:**
   ```bash
   netlify deploy --prod
   ```

4. **Set environment variables in Netlify dashboard**

5. **Update your frontend URLs to use the Netlify function URLs**

---

## Environment Variables Needed

For all options, you need these environment variables:

```bash
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## Testing Your Deployment

1. **Test the health endpoint:**
   ```bash
   curl https://your-deployed-url.com/health
   ```

2. **Test the API endpoints:**
   ```bash
   curl -X POST https://your-deployed-url.com/.netlify/functions/create-checkout-session \
     -H "Content-Type: application/json" \
     -d '{"tier":"starter","userId":"test","successUrl":"https://example.com","cancelUrl":"https://example.com"}'
   ```

---

## Which Option Should You Choose?

- **Netlify Functions**: Best for beginners, completely free
- **Railway**: Good for auto-deployment from Git
- **Render**: Good alternative to Heroku
- **Local + ngrok**: Best for development and testing

All options will work equally well for your Stripe integration! 