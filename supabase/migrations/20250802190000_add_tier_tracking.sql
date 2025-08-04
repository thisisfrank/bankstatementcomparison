-- Add tier tracking fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'anonymous',
ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;

-- Create usage_logs table for tracking usage
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

-- Enable RLS for usage_logs
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for usage_logs
CREATE POLICY "Users can view own usage logs" ON usage_logs
  FOR ALL USING (
    (auth.uid() = user_id) OR
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- Note: Test user profile will be created when user signs up 