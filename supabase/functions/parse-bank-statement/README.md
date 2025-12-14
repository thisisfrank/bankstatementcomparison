# Parse Bank Statement Edge Function

This Edge Function securely handles Bank Statement Converter API calls, keeping your API key hidden from the frontend.

## Deployment

1. **Install Supabase CLI** (if not already installed):
```bash
npm install -g supabase
```

2. **Login to Supabase**:
```bash
supabase login
```

3. **Link to your project**:
```bash
supabase link --project-ref srbfsweiwiqbkjajkbng
```

4. **Set the required secrets**:
```bash
supabase secrets set PDF_PARSER_API_KEY=your_api_key_here
supabase secrets set PDF_PARSER_API_URL=https://api2.bankstatementconverter.com/api/v1
```

5. **Deploy the function**:
```bash
supabase functions deploy parse-bank-statement
```

## Testing

You can test the function locally:

```bash
# Start local Supabase
supabase start

# Serve the function locally
supabase functions serve parse-bank-statement --env-file .env.local

# Test with curl
curl -i --location --request POST 'http://localhost:54321/functions/v1/parse-bank-statement' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"action":"upload","file":{"data":"base64_encoded_pdf_here","name":"test.pdf"}}'
```

## Security

- API keys are stored in Supabase Secrets (never exposed to frontend)
- Function validates requests using Supabase authentication
- All API calls are made server-side





















