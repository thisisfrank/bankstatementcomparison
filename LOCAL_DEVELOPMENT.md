# Local Development Setup

This guide shows you how to run the Stripe integration locally for testing.

## 🚀 **Quick Start**

### **Option 1: Netlify Dev (Recommended)**

1. **Set up environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your actual keys
   ```

2. **Start Netlify Dev:**
   ```bash
   npm run dev:netlify
   ```

3. **Your app will be available at:**
   - Frontend: `http://localhost:8888`
   - Functions: `http://localhost:8888/.netlify/functions/`

### **Option 2: Express Server**

1. **Set up environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your actual keys
   ```

2. **Start the Express server:**
   ```bash
   npm run dev:server
   ```

3. **Start the frontend:**
   ```bash
   npm run dev
   ```

4. **Your app will be available at:**
   - Frontend: `http://localhost:5173`
   - API: `http://localhost:3001`

## 🔑 **Environment Variables Needed**

Copy `env.example` to `.env` and fill in:

```bash
# Stripe Keys (get from Stripe Dashboard)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
VITE_STRIPE_SECRET_KEY=sk_test_your_key_here

# Supabase Keys (get from Supabase Dashboard)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# PDF Parser API
VITE_PDF_PARSER_API_KEY=your_api_key_here
```

## 🧪 **Testing Locally**

### **Test the Functions:**

1. **Test create-checkout-session:**
   ```bash
   curl -X POST http://localhost:8888/.netlify/functions/create-checkout-session \
     -H "Content-Type: application/json" \
     -d '{"tier":"starter","userId":"test","successUrl":"http://localhost:8888","cancelUrl":"http://localhost:8888"}'
   ```

2. **Test confirm-payment:**
   ```bash
   curl -X POST http://localhost:8888/.netlify/functions/confirm-payment \
     -H "Content-Type: application/json" \
     -d '{"sessionId":"cs_test_session_id"}'
   ```

### **Test the Frontend:**

1. **Open your app in the browser**
2. **Try to upgrade a tier**
3. **Check the browser console for any errors**

## 🔧 **Getting Your Keys**

### **Stripe Keys:**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Developers → API Keys**
3. Copy your **Publishable key** and **Secret key**

### **Supabase Keys:**
1. Go to your [Supabase Project](https://supabase.com/dashboard)
2. Navigate to **Settings → API**
3. Copy your **Project URL** and **anon key**

## 🐛 **Troubleshooting**

### **Common Issues:**

1. **"Function not found"**
   - Make sure you're running `netlify dev`
   - Check that the functions are in `netlify/functions/`

2. **"Environment variables not found"**
   - Make sure you created `.env`
   - Restart the dev server after adding variables

3. **"CORS errors"**
   - The functions include CORS headers
   - Make sure you're using the correct URLs

4. **"Stripe errors"**
   - Check your Stripe keys are correct
   - Make sure you're using test keys for development

## 📝 **Development Workflow**

1. **Make changes to your code**
2. **Test locally with `npm run dev:netlify`**
3. **Commit and push to GitHub**
4. **Netlify automatically deploys**

## 🎯 **What's Different Locally vs Production**

- **Local:** Functions run on `localhost:8888`
- **Production:** Functions run on `your-site.netlify.app`
- **Local:** Uses `.env` for environment variables
- **Production:** Uses Netlify dashboard environment variables

The code is exactly the same - only the URLs change! 