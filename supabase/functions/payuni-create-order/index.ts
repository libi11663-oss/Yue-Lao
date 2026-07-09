import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const allowedAmounts = new Set([100, 300, 600]);
const defaultReturnUrl = Deno.env.get('SITE_URL') || 'https://yuelao.tw';

function buf2hex(buffer: Uint8Array) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

async function encryptAESGCM(plainText: string, keyStr: string, ivStr: string) {
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(keyStr);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer.slice(0, 32),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  const ivBuffer = encoder.encode(ivStr).slice(0, 12);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuffer },
    cryptoKey,
    encoder.encode(plainText)
  );

  return buf2hex(new Uint8Array(encrypted));
}

async function sha256(text: string) {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return buf2hex(new Uint8Array(hashBuffer)).toUpperCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { amount, orderDesc, returnUrl } = await req.json()
    const offeringAmount = Number(amount);

    if (!allowedAmounts.has(offeringAmount)) {
      return new Response(JSON.stringify({ error: 'Invalid offering amount' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const merId = Deno.env.get('PAYUNI_MER_ID')
    const hashKey = Deno.env.get('PAYUNI_HASH_KEY')
    const ivKey = Deno.env.get('PAYUNI_IV_KEY')
    const projectRef = Deno.env.get('SUPABASE_PROJECT_REF') || 'upjwcezmgjijnthciywz'

    const missingSecrets = [
      ['PAYUNI_MER_ID', merId],
      ['PAYUNI_HASH_KEY', hashKey],
      ['PAYUNI_IV_KEY', ivKey],
    ].filter(([, value]) => !value).map(([name]) => name)

    if (missingSecrets.length > 0) {
      return new Response(JSON.stringify({
        error: 'Payment secrets are not configured',
        missingSecrets,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const timeStamp = Math.floor(Date.now() / 1000);
    const merTradeNo = `YL${Date.now()}`;
    const safeReturnUrl =
      typeof returnUrl === 'string' && returnUrl.startsWith('https://')
        ? returnUrl
        : defaultReturnUrl;

    const tradeParams = new URLSearchParams({
      MerID: merId,
      Version: "1.0",
      RespondType: "JSON",
      MerTradeNo: merTradeNo,
      Amt: String(offeringAmount),
      TradeDesc: typeof orderDesc === 'string' ? orderDesc : 'Yue Lao Offering',
      TimeStamp: String(timeStamp),
      ReturnURL: safeReturnUrl,
      NotifyURL: `https://${projectRef}.supabase.co/functions/v1/payuni-notify`,
    });

    const tradeInfo = await encryptAESGCM(tradeParams.toString(), hashKey, ivKey);
    const shaString = hashKey + tradeInfo + ivKey;
    const tradeSha = await sha256(shaString);
    const payuniApiUrl = "https://api.payuni.com.tw/api/upp/transaction/create";

    return new Response(
      JSON.stringify({
        success: true,
        payuniApiUrl,
        merId,
        tradeInfo,
        tradeSha,
        merTradeNo
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
