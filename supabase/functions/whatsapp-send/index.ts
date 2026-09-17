// Production Edge Function skeleton.
// Deploy with Supabase CLI after configuring:
// supabase secrets set WHATSAPP_ACCESS_TOKEN=...
// supabase secrets set WHATSAPP_PHONE_NUMBER_ID=...

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    const body = await req.json();
    const { to, templateName, languageCode = "en_US", components = [] } = body;

    if (!to || !templateName) {
      return new Response(JSON.stringify({ error: "to and templateName are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    if (!token || !phoneNumberId) {
      return new Response(JSON.stringify({ error: "WhatsApp secrets are not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components
          }
        })
      }
    );

    const result = await response.json();
    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});