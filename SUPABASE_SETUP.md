# Supabase Setup Instructions

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and anon key

## 2. Environment Variables

Create a `.env` file in the root directory:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# API Configuration
VITE_API_KEY=your_bank_statement_api_key
VITE_API_BASE_URL=https://api2.bankstatementconverter.com/api/v1

# Stripe Configuration
VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
```

## 3. Database Setup

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Run the SQL from `supabase/schema.sql`

## 4. Authentication Setup

1. In Supabase dashboard, go to Authentication > Settings
2. Configure your site URL
3. Set up email templates if needed

## 5. Row Level Security

The schema includes RLS policies that ensure users can only access their own data.

## 6. Credit System

- Free tier: 30 credits/month
- Starter: 150 credits/month  
- Pro: 400 credits/month
- Business: 1000 credits/month

## 7. Usage Tracking

The system tracks:
- PDF uploads (credits based on page count)
- CSV exports (1 credit)
- PDF exports (2 credits)

## 8. Features Enabled

✅ User authentication
✅ Credit tracking
✅ Comparison history
✅ Usage logging
✅ Tier-based access
✅ Data persistence
✅ Row Level Security 