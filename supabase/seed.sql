-- Seed data for testing
-- Add some test usage logs for anonymous users

-- Add some test usage logs
INSERT INTO usage_logs (user_id, action, pages_processed, credits_used)
VALUES 
  (NULL, 'comparison', 25, 25),
  (NULL, 'comparison', 30, 30),
  (NULL, 'comparison', 15, 15)
ON CONFLICT DO NOTHING; 