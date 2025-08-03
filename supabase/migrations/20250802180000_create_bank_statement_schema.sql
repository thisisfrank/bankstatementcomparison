-- Create bank statement comparison schema
-- This migration creates all tables needed for the bank statement comparison app

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Statements Table
CREATE TABLE statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id VARCHAR(255), -- For anonymous users
  name VARCHAR(255) NOT NULL, -- "Wells Fargo Statement", "Chase Statement"
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  parsed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) DEFAULT 'uploaded', -- uploaded, processing, parsed, error
  total_withdrawals DECIMAL(10,2) DEFAULT 0,
  total_deposits DECIMAL(10,2) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  file_url TEXT -- Store PDF file in Supabase Storage
);

-- 2. Transactions Table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID REFERENCES statements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id VARCHAR(255), -- For anonymous users
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  category VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'withdrawal' or 'deposit'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Comparisons Table
CREATE TABLE comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id VARCHAR(255), -- For anonymous users
  name VARCHAR(255), -- Optional comparison name
  statement1_id UUID REFERENCES statements(id),
  statement2_id UUID REFERENCES statements(id),
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

-- 4. Export Files Table
CREATE TABLE export_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID REFERENCES comparisons(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id VARCHAR(255), -- For anonymous users
  file_type VARCHAR(10) NOT NULL, -- 'pdf' or 'csv'
  file_url TEXT NOT NULL, -- Supabase Storage URL
  file_size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. User Profiles Table (optional extension)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(255),
  tier VARCHAR(50) DEFAULT 'free', -- free, basic, premium, enterprise
  credits INTEGER DEFAULT 0, -- Available credits for premium features
  preferences JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_statements_user_id ON statements(user_id);
CREATE INDEX idx_statements_session_id ON statements(session_id);
CREATE INDEX idx_statements_status ON statements(status);
CREATE INDEX idx_transactions_statement_id ON transactions(statement_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_session_id ON transactions(session_id);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_comparisons_user_id ON comparisons(user_id);
CREATE INDEX idx_comparisons_session_id ON comparisons(session_id);
CREATE INDEX idx_comparisons_created_at ON comparisons(created_at);
CREATE INDEX idx_export_files_comparison_id ON export_files(comparison_id);
CREATE INDEX idx_export_files_session_id ON export_files(session_id);

-- Enable Row Level Security (RLS)
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Statements: Users can see their own statements or anonymous statements with matching session_id
CREATE POLICY "Users can view own statements" ON statements
  FOR ALL USING (
    (auth.uid() = user_id) OR 
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- Transactions: Users can see their own transactions or anonymous transactions with matching session_id
CREATE POLICY "Users can view own transactions" ON transactions
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

-- Export files: Users can see their own export files or anonymous export files with matching session_id
CREATE POLICY "Users can view own export files" ON export_files
  FOR ALL USING (
    (auth.uid() = user_id) OR 
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- Profiles: Users can only see their own profile (authenticated users only)
CREATE POLICY "Users can view own profile" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for comparisons table
CREATE TRIGGER update_comparisons_updated_at 
  BEFORE UPDATE ON comparisons 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for profiles table
CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 