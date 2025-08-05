-- Apply missing migration: Add individual statement totals to comparisons table
-- This allows breaking down withdrawals and deposits by statement

ALTER TABLE comparisons 
ADD COLUMN IF NOT EXISTS statement1_withdrawals DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS statement1_deposits DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS statement2_withdrawals DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS statement2_deposits DECIMAL(10,2) DEFAULT 0;

-- Add comment to explain the new columns
COMMENT ON COLUMN comparisons.statement1_withdrawals IS 'Total withdrawals for statement 1';
COMMENT ON COLUMN comparisons.statement1_deposits IS 'Total deposits for statement 1';
COMMENT ON COLUMN comparisons.statement2_withdrawals IS 'Total withdrawals for statement 2';
COMMENT ON COLUMN comparisons.statement2_deposits IS 'Total deposits for statement 2'; 