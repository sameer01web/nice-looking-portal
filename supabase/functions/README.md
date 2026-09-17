# WhatsApp Edge Function

Use a Supabase Edge Function for real WhatsApp Business Cloud API calls.

Do NOT put these secrets in React/Vite:
- WHATSAPP_ACCESS_TOKEN
- WHATSAPP_PHONE_NUMBER_ID

Store them as Supabase Edge Function secrets.

Recommended flow:

React
  -> Supabase Edge Function
  -> WhatsApp Cloud API
  -> customer

For invoice messages and marketing offers, use approved WhatsApp message templates where required by WhatsApp Business Platform policies.

The current React MVP opens `wa.me` for a safe demo/manual flow. Replace that action with an authenticated Edge Function when the client's Meta WhatsApp Business account is ready.
