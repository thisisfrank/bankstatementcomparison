-- Fix RLS policies to properly support INSERT operations
-- The original policies only had USING clauses, which work for SELECT
-- but INSERT operations need WITH CHECK clauses to validate new rows

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own statements" ON statements;
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can view own comparisons" ON comparisons;
DROP POLICY IF EXISTS "Users can view own export files" ON export_files;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own usage logs" ON usage_logs;

-- ===========================================
-- STATEMENTS TABLE POLICIES
-- ===========================================

-- SELECT policy: Users can read their own statements
CREATE POLICY "statements_select_policy" ON statements
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

-- INSERT policy: Users can insert their own statements
CREATE POLICY "statements_insert_policy" ON statements
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

-- UPDATE policy: Users can update their own statements
CREATE POLICY "statements_update_policy" ON statements
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  ) WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

-- DELETE policy: Users can delete their own statements
CREATE POLICY "statements_delete_policy" ON statements
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

-- ===========================================
-- TRANSACTIONS TABLE POLICIES
-- ===========================================

CREATE POLICY "transactions_select_policy" ON transactions
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "transactions_insert_policy" ON transactions
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "transactions_update_policy" ON transactions
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  ) WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "transactions_delete_policy" ON transactions
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

-- ===========================================
-- COMPARISONS TABLE POLICIES
-- ===========================================

CREATE POLICY "comparisons_select_policy" ON comparisons
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "comparisons_insert_policy" ON comparisons
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "comparisons_update_policy" ON comparisons
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  ) WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "comparisons_delete_policy" ON comparisons
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

-- ===========================================
-- EXPORT FILES TABLE POLICIES
-- ===========================================

CREATE POLICY "export_files_select_policy" ON export_files
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "export_files_insert_policy" ON export_files
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "export_files_update_policy" ON export_files
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  ) WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "export_files_delete_policy" ON export_files
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

-- ===========================================
-- USAGE LOGS TABLE POLICIES
-- ===========================================

CREATE POLICY "usage_logs_select_policy" ON usage_logs
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "usage_logs_insert_policy" ON usage_logs
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "usage_logs_update_policy" ON usage_logs
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  ) WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

CREATE POLICY "usage_logs_delete_policy" ON usage_logs
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
  );

-- ===========================================
-- PROFILES TABLE POLICIES
-- ===========================================

-- Profiles are for authenticated users only
CREATE POLICY "profiles_select_policy" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_policy" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_policy" ON profiles
  FOR UPDATE USING (auth.uid() = id) 
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete_policy" ON profiles
  FOR DELETE USING (auth.uid() = id);


















