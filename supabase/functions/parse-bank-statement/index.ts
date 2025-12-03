// Edge Function to securely handle Bank Statement Converter API calls
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get API credentials from environment variables (secure server-side)
    const API_KEY = Deno.env.get('PDF_PARSER_API_KEY')
    const API_BASE_URL = Deno.env.get('PDF_PARSER_API_URL') || 'https://api2.bankstatementconverter.com/api/v1'

    if (!API_KEY) {
      throw new Error('PDF_PARSER_API_KEY is not configured')
    }

    // Parse the request
    const { action, file, uuid } = await req.json()

    console.log('Processing action:', action)

    let response

    switch (action) {
      case 'upload': {
        // Upload the PDF file
        const formData = new FormData()
        
        // Convert base64 back to blob if necessary
        const fileBlob = new Blob([Uint8Array.from(atob(file.data), c => c.charCodeAt(0))], {
          type: 'application/pdf'
        })
        formData.append('file', fileBlob, file.name)

        console.log('Uploading file to Bank Statement Converter API...')
        const uploadResponse = await fetch(`${API_BASE_URL}/BankStatement`, {
          method: 'POST',
          headers: {
            'Authorization': API_KEY,
          },
          body: formData
        })

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text()
          console.error('Upload failed:', errorText)
          throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`)
        }

        const uploadResult = await uploadResponse.json()
        console.log('Upload successful')
        response = uploadResult
        break
      }

      case 'status': {
        // Check processing status
        console.log('Checking status for UUID:', uuid)
        const statusResponse = await fetch(`${API_BASE_URL}/BankStatement/status`, {
          method: 'POST',
          headers: {
            'Authorization': API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([uuid])
        })

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text()
          console.error('Status check failed:', errorText)
          throw new Error(`Status check failed: ${statusResponse.status} - ${errorText}`)
        }

        const statusResult = await statusResponse.json()
        response = statusResult
        break
      }

      case 'convert': {
        // Convert to JSON
        console.log('Converting statement to JSON for UUID:', uuid)
        const convertResponse = await fetch(`${API_BASE_URL}/BankStatement/convert?format=JSON`, {
          method: 'POST',
          headers: {
            'Authorization': API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([uuid])
        })

        if (!convertResponse.ok) {
          const errorText = await convertResponse.text()
          console.error('Conversion failed:', errorText)
          throw new Error(`Conversion failed: ${convertResponse.status} - ${errorText}`)
        }

        const convertResult = await convertResponse.json()
        console.log('Conversion successful')
        response = convertResult
        break
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Error in parse-bank-statement function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})




