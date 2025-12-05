-- =====================================================================
-- FIX DATABASE SCHEMA - Run this in Supabase SQL Editor
-- =====================================================================
-- This script will fix all missing tables and columns for profitability features
-- Safe to run multiple times (idempotent)
-- =====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. FIX PROFILES TABLE - Add missing columns for tier tracking
-- =====================================================================

-- Check if profiles table exists, if not create it
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(255),
  tier VARCHAR(50) DEFAULT 'anonymous',
  credits INTEGER DEFAULT 20, -- Default credits for new users
  preferences JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add tier column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'profiles' AND column_name = 'tier') THEN
    ALTER TABLE profiles ADD COLUMN tier VARCHAR(50) DEFAULT 'anonymous';
  END IF;
END $$;

-- Add credits column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'profiles' AND column_name = 'credits') THEN
    ALTER TABLE profiles ADD COLUMN credits INTEGER DEFAULT 20;
  END IF;
END $$;

-- =====================================================================
-- 2. CREATE USAGE_LOGS TABLE - Track user usage for billing
-- =====================================================================

CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id VARCHAR(255), -- For anonymous users
  action VARCHAR(50) NOT NULL, -- 'comparison', 'page_processed', 'credit_purchase'
  pages_processed INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for usage_logs
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_session_id ON usage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);

-- =====================================================================
-- 3. CREATE COMPARISONS TABLE - Save comparison history
-- =====================================================================

CREATE TABLE IF NOT EXISTS comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id VARCHAR(255), -- For anonymous users
  name VARCHAR(255), -- Optional comparison name
  statement1_name VARCHAR(255) NOT NULL, -- Store custom names
  statement2_name VARCHAR(255) NOT NULL,
  categories JSONB NOT NULL, -- Array of compared categories
  results JSONB, -- Store comparison results
  total_withdrawals DECIMAL(10,2) DEFAULT 0,
  total_deposits DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'completed', -- completed, processing, error
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for comparisons
CREATE INDEX IF NOT EXISTS idx_comparisons_user_id ON comparisons(user_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_session_id ON comparisons(session_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_created_at ON comparisons(created_at);

-- =====================================================================
-- 4. ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 5. CREATE RLS POLICIES - Secure data access
-- =====================================================================

-- Drop existing policies if they exist (to make script idempotent)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own usage logs" ON usage_logs;
DROP POLICY IF EXISTS "Users can view own comparisons" ON comparisons;

-- Profiles: Users can only see and update their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Usage logs: Users can see their own logs or anonymous logs with matching session_id
CREATE POLICY "Users can view own usage logs" ON usage_logs
  FOR ALL USING (
    (auth.uid() = user_id) OR
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- Comparisons: Users can see their own comparisons or anonymous comparisons with matching session_id
CREATE POLICY "Users can view own comparisons" ON comparisons
  FOR ALL USING (
    (auth.uid() = user_id) OR 
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- =====================================================================
-- 6. CREATE TRIGGERS - Auto-update timestamps
-- =====================================================================

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_comparisons_updated_at ON comparisons;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;

-- Create triggers
CREATE TRIGGER update_comparisons_updated_at 
  BEFORE UPDATE ON comparisons 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 7. INITIALIZE EXISTING USERS - Give them credits
-- =====================================================================

-- Create profiles for any existing auth users who don't have one yet
INSERT INTO profiles (id, tier, credits)
SELECT 
  id,
  'signup' as tier, -- Existing users get signup tier
  40 as credits -- Signup tier gets 40 credits
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- DONE! Your database is now ready for profitability tracking! 💰
-- =====================================================================

-- Verify the setup
SELECT 
  'profiles' as table_name, 
  COUNT(*) as row_count,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'credits') as has_credits_column
FROM profiles
UNION ALL
SELECT 
  'usage_logs' as table_name, 
  COUNT(*) as row_count,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'usage_logs' AND column_name = 'action') as has_action_column
FROM usage_logs
UNION ALL
SELECT 
  'comparisons' as table_name, 
  COUNT(*) as row_count,
  1 as table_exists
FROM comparisons;








