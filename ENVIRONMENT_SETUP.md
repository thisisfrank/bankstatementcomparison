# Environment Variable Setup Guide

## Problem
The API works locally but not in production because environment variables are not properly configured.

## Root Cause
- Local environment has `.env` file with correct API settings
- Production environment uses fallback values from code
- `.env` files are gitignored (not committed to repository)

## Solution

### 1. Create Environment Template
Create a `.env.example` file that shows what environment variables are needed:

```bash
# API Configuration
VITE_PDF_PARSER_API_KEY=your_api_key_here
VITE_PDF_PARSER_API_URL=https://api2.bankstatementconverter.com/api/v1
```

### 2. Local Development Setup
1. Copy `.env.example` to `.env`
2. Fill in your actual API credentials
3. The `.env` file will be ignored by git (as intended)

### 3. Production Environment Setup
You need to set these environment variables in your production environment:

#### For Vercel:
```bash
vercel env add VITE_PDF_PARSER_API_KEY
vercel env add VITE_PDF_PARSER_API_URL
```

#### For Netlify:
Add in Netlify dashboard under Site settings > Environment variables

#### For other platforms:
Set the environment variables according to your hosting platform's documentation.

### 4. Debugging Environment Variables
The app now logs environment variable status on startup. Check the browser console to see:
- Which environment variables are set
- Which fallback values are being used
- API configuration being used

### 5. Testing Environment Variables
You can test if environment variables are working by:
1. Opening browser console
2. Looking for "API Configuration:" log message
3. Checking if environment variables show "Set" or "Not set"

## Current Fallback Values
If environment variables are not set, the app uses:
- API Key: `api-AB7psQuumDdjVHLTPYMDghH2xUgaKcuJZVvwReMMsxM9iQBaYJg/BrelRUX07neH`
- API URL: `https://api2.bankstatementconverter.com/api/v1`

## Next Steps
1. Create `.env.example` file
2. Set environment variables in production
3. Test with real PDF files
4. Monitor console logs for API status 