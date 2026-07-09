import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    const { amount, orderDesc, returnUrl } = await req.json()

    const merId = Deno.env.get('PAYUNI_MER_ID')!
    const hashKey = Deno.env.get('PAYUNI_HASH_KEY')!
    const ivKey = Deno.env.get('PAYUNI_IV_KEY')!

    const timeStamp = Math.floor(Date.now() / 1000);
    const merTradeNo = `YL${Date.now()}`;

    const tradeParams = new URLSearchParams({
      MerID: merId,
      Version: "1.0",
      RespondType: "JSON",
      MerTradeNo: merTradeNo,
      Amt: String(amount),
      TradeDesc: orderDesc,
      TimeStamp: String(timeStamp),
      ReturnURL: returnUrl,
      NotifyURL: `https://${Deno.env.get('SUPABASE_PROJECT_REF')}.supabase.co/functions/v1/payuni-notify`,
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
        tradeSha
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
