-- Fix session validation for anonymous users
-- The previous RLS policies didn't actually validate that the session_id in the row
-- matches the requesting user's session. This migration fixes that by using
-- set_config() to pass the session_id from the application to PostgreSQL.

-- ===========================================
-- CREATE SESSION CONTEXT FUNCTION
-- ===========================================

-- Function to set the session context for anonymous users
-- This should be called before any queries for anonymous users
CREATE OR REPLACE FUNCTION set_session_context(p_session_id TEXT)
RETURNS void AS $$
BEGIN
  -- Set the session_id in the current transaction's config
  PERFORM set_config('app.session_id', p_session_id, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION set_session_context(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION set_session_context(TEXT) TO authenticated;

-- ===========================================
-- DROP EXISTING POLICIES
-- ===========================================

-- Statements
DROP POLICY IF EXISTS "statements_select_policy" ON statements;
DROP POLICY IF EXISTS "statements_insert_policy" ON statements;
DROP POLICY IF EXISTS "statements_update_policy" ON statements;
DROP POLICY IF EXISTS "statements_delete_policy" ON statements;

-- Transactions
DROP POLICY IF EXISTS "transactions_select_policy" ON transactions;
DROP POLICY IF EXISTS "transactions_insert_policy" ON transactions;
DROP POLICY IF EXISTS "transactions_update_policy" ON transactions;
DROP POLICY IF EXISTS "transactions_delete_policy" ON transactions;

-- Comparisons
DROP POLICY IF EXISTS "comparisons_select_policy" ON comparisons;
DROP POLICY IF EXISTS "comparisons_insert_policy" ON comparisons;
DROP POLICY IF EXISTS "comparisons_update_policy" ON comparisons;
DROP POLICY IF EXISTS "comparisons_delete_policy" ON comparisons;

-- Export files
DROP POLICY IF EXISTS "export_files_select_policy" ON export_files;
DROP POLICY IF EXISTS "export_files_insert_policy" ON export_files;
DROP POLICY IF EXISTS "export_files_update_policy" ON export_files;
DROP POLICY IF EXISTS "export_files_delete_policy" ON export_files;

-- Usage logs
DROP POLICY IF EXISTS "usage_logs_select_policy" ON usage_logs;
DROP POLICY IF EXISTS "usage_logs_insert_policy" ON usage_logs;
DROP POLICY IF EXISTS "usage_logs_update_policy" ON usage_logs;
DROP POLICY IF EXISTS "usage_logs_delete_policy" ON usage_logs;

-- Profiles (keep as-is, they're for authenticated users only)
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON profiles;

-- ===========================================
-- STATEMENTS TABLE POLICIES
-- ===========================================

CREATE POLICY "statements_select_policy" ON statements
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "statements_insert_policy" ON statements
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "statements_update_policy" ON statements
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  ) WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "statements_delete_policy" ON statements
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

-- ===========================================
-- TRANSACTIONS TABLE POLICIES
-- ===========================================

CREATE POLICY "transactions_select_policy" ON transactions
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "transactions_insert_policy" ON transactions
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "transactions_update_policy" ON transactions
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  ) WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "transactions_delete_policy" ON transactions
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

-- ===========================================
-- COMPARISONS TABLE POLICIES
-- ===========================================

CREATE POLICY "comparisons_select_policy" ON comparisons
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "comparisons_insert_policy" ON comparisons
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "comparisons_update_policy" ON comparisons
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  ) WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "comparisons_delete_policy" ON comparisons
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

-- ===========================================
-- EXPORT FILES TABLE POLICIES
-- ===========================================

CREATE POLICY "export_files_select_policy" ON export_files
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "export_files_insert_policy" ON export_files
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "export_files_update_policy" ON export_files
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  ) WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "export_files_delete_policy" ON export_files
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

-- ===========================================
-- USAGE LOGS TABLE POLICIES
-- ===========================================

CREATE POLICY "usage_logs_select_policy" ON usage_logs
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "usage_logs_insert_policy" ON usage_logs
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "usage_logs_update_policy" ON usage_logs
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  ) WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
  );

CREATE POLICY "usage_logs_delete_policy" ON usage_logs
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR 
    (auth.uid() IS NULL AND user_id IS NULL AND session_id = current_setting('app.session_id', true))
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









