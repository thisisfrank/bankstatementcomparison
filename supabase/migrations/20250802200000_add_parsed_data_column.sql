-- Add parsed_data column to comparisons table for storing transaction data
-- This enables editing transactions in historical/past document views

ALTER TABLE comparisons 
ADD COLUMN IF NOT EXISTS parsed_data JSONB;

-- Add comment for documentation
COMMENT ON COLUMN comparisons.parsed_data IS 'Stores the full parsed statement data including transactions for editing historical comparisons';



