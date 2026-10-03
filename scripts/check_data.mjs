import fs from "fs";

// Parse .env
const envContent = fs.readFileSync(".env", "utf-8");
const env = {};
envContent.split("\n").forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || "";
    val = val.trim().replace(/^["']|["']$/g, "");
    env[match[1]] = val;
  }
});

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

console.log("Connecting to Supabase REST API:", url);

const tables = [
  "salons",
  "profiles",
  "customers",
  "services",
  "wig_products",
  "transactions",
  "invoices",
  "audit_logs",
  "offers",
  "whatsapp_messages"
];

async function check() {
  for (const table of tables) {
    try {
      const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
        headers: {
          "apikey": key,
          "Authorization": `Bearer ${key}`,
          "Range-Unit": "items",
          "Prefer": "count=exact"
        }
      });
      if (!res.ok) {
        console.error(`Error on ${table}: ${res.status} ${res.statusText}`, await res.text());
        continue;
      }
      const data = await res.json();
      const contentRange = res.headers.get("content-range");
      console.log(`Table '${table}': count=${contentRange || data.length}`);
      if (data.length > 0) {
        console.log(`  Items:`, data.map(r => ({
          id: r.id,
          name: r.name || r.product_name || r.title || r.action || r.full_name || r.invoice_number,
          salon_id: r.salon_id
        })));
      }
    } catch (e) {
      console.error(`Fetch failed for ${table}:`, e.message);
    }
  }
}

check();
