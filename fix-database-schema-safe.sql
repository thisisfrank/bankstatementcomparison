-- =====================================================================
-- FIX DATABASE SCHEMA - SAFE VERSION (Handles Existing Tables)
-- =====================================================================
-- Run this in Supabase SQL Editor
-- This version is more careful about existing columns and tables
-- =====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- STEP 1: Check what exists
-- =====================================================================

-- First, let's see what we're working with
-- Run this separately to see current state (OPTIONAL - for debugging)
/*
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN ('profiles', 'usage_logs', 'comparisons')
ORDER BY table_name, ordinal_position;
*/

-- =====================================================================
-- STEP 2: Fix or create PROFILES table
-- =====================================================================

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add tier column if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'tier'
  ) THEN
    ALTER TABLE profiles ADD COLUMN tier VARCHAR(50) DEFAULT 'signup';
    RAISE NOTICE 'Added tier column to profiles';
  ELSE
    RAISE NOTICE 'Tier column already exists';
  END IF;
END $$;

-- Add credits column if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'credits'
  ) THEN
    ALTER TABLE profiles ADD COLUMN credits INTEGER DEFAULT 40;
    RAISE NOTICE 'Added credits column to profiles';
  ELSE
    RAISE NOTICE 'Credits column already exists';
  END IF;
END $$;

-- Add preferences column if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'preferences'
  ) THEN
    ALTER TABLE profiles ADD COLUMN preferences JSONB;
    RAISE NOTICE 'Added preferences column to profiles';
  ELSE
    RAISE NOTICE 'Preferences column already exists';
  END IF;
END $$;

-- =====================================================================
-- STEP 3: Create USAGE_LOGS table
-- =====================================================================

CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  pages_processed INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_session_id ON usage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);

-- =====================================================================
-- STEP 4: Create COMPARISONS table
-- =====================================================================

CREATE TABLE IF NOT EXISTS comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id VARCHAR(255),
  name VARCHAR(255),
  statement1_name VARCHAR(255) NOT NULL,
  statement2_name VARCHAR(255) NOT NULL,
  categories JSONB NOT NULL,
  results JSONB,
  total_withdrawals DECIMAL(10,2) DEFAULT 0,
  total_deposits DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_comparisons_user_id ON comparisons(user_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_session_id ON comparisons(session_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_created_at ON comparisons(created_at);

-- =====================================================================
-- STEP 5: Enable Row Level Security
-- =====================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- STEP 6: Create or Replace RLS Policies
-- =====================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own usage logs" ON usage_logs;
DROP POLICY IF EXISTS "Users can view own comparisons" ON comparisons;

-- Create new policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users can view own usage logs" ON usage_logs
  FOR ALL USING (
    (auth.uid() = user_id) OR
    (user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "Users can view own comparisons" ON comparisons
  FOR ALL USING (
    (auth.uid() = user_id) OR 
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- =====================================================================
-- STEP 7: Create Triggers
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
-- STEP 8: Initialize existing users (SAFE VERSION)
-- =====================================================================

-- Update existing profiles that are missing tier or credits
UPDATE profiles
SET 
  tier = COALESCE(tier, 'signup'),
  credits = COALESCE(credits, 40)
WHERE tier IS NULL OR credits IS NULL;

-- Create profiles for auth users who don't have a profile yet
-- Only insert the columns we know exist
INSERT INTO profiles (id, tier, credits)
SELECT 
  au.id,
  'signup' as tier,
  40 as credits
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = au.id
)
ON CONFLICT (id) DO UPDATE SET
  tier = COALESCE(profiles.tier, 'signup'),
  credits = COALESCE(profiles.credits, 40);

-- =====================================================================
-- DONE! Verify the setup
-- =====================================================================

SELECT 
  'profiles' as table_name,
  COUNT(*) as row_count,
  COUNT(CASE WHEN tier IS NOT NULL THEN 1 END) as has_tier,
  COUNT(CASE WHEN credits IS NOT NULL THEN 1 END) as has_credits,
  SUM(COALESCE(credits, 0)) as total_credits
FROM profiles
UNION ALL
SELECT 
  'usage_logs' as table_name,
  COUNT(*) as row_count,
  NULL as has_tier,
  NULL as has_credits,
  SUM(COALESCE(credits_used, 0)) as total_credits
FROM usage_logs
UNION ALL
SELECT 
  'comparisons' as table_name,
  COUNT(*) as row_count,
  NULL as has_tier,
  NULL as has_credits,
  NULL as total_credits
FROM comparisons;

-- Show your profile
SELECT 
  id,
  full_name,
  tier,
  credits,
  created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 5;




