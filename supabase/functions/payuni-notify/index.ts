import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    })
  }

  try {
    const contentType = req.headers.get('content-type') || ''
    const payload = contentType.includes('application/json')
      ? await req.json()
      : Object.fromEntries((await req.formData()).entries())

    console.log('payuni notify received', JSON.stringify(payload))

    return new Response('OK', {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('payuni notify error', error)
    return new Response('OK', {
      status: 200,
      headers: corsHeaders,
    })
  }
})
