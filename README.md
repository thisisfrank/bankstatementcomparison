# Bank Statement Comparison Tool

A web application for comparing bank statements and analyzing spending patterns.

## Features

- Upload and parse PDF bank statements
- Compare spending across different time periods
- Categorize transactions automatically
- Visual charts and analytics
- Export results to PDF/CSV

## Environment Variables

Set these in your production environment:

```
VITE_PDF_PARSER_API_KEY=your_api_key_here
VITE_PDF_PARSER_API_URL=https://api2.bankstatementconverter.com/api/v1
```

## Development

```bash
npm install
npm run dev
```

## Deployment

This project is configured for deployment on Netlify with automatic builds from Git. 