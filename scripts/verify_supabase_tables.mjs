import fs from "fs";

// Parse .env
let env = {};
try {
  const envContent = fs.readFileSync(".env", "utf-8");
  envContent.split("\n").forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      env[match[1]] = (match[2] || "").trim().replace(/^["']|["']$/g, "");
    }
  });
} catch (e) {
  console.warn("Could not read .env:", e.message);
}

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "https://vcoeyueuwugfguivfuft.supabase.co";
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "sb_publishable_yvHCYU_1Sml8Nj6LEZf13g_5Y6-wIq2";

console.log("Connecting to Supabase endpoint:", url);

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
  "whatsapp_messages",
  "employees",
  "attendance",
  "payroll_settings",
  "payrolls",
  "payroll_items",
  "salary_payments"
];

async function runCheck() {
  const results = [];
  for (const t of tables) {
    try {
      const res = await fetch(`${url}/rest/v1/${t}?select=*`, {
        method: "GET",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: "0-0",
          Prefer: "count=exact"
        }
      });
      const contentRange = res.headers.get("content-range");
      if (res.ok) {
        results.push({ table: t, status: "OK", count: contentRange || "accessible" });
        console.log(`✅ Table '${t}': OK (count: ${contentRange || "available"})`);
      } else {
        const txt = await res.text();
        results.push({ table: t, status: "FAILED", error: `${res.status} ${txt}` });
        console.log(`❌ Table '${t}': ${res.status} - ${txt}`);
      }
    } catch (err) {
      results.push({ table: t, status: "ERROR", error: err.message });
      console.log(`❌ Table '${t}': ${err.message}`);
    }
  }

  // Also test key RPC functions
  const rpcs = [
    "create_invoice_with_stock",
    "deduct_wig_stock"
  ];
  console.log("\nTesting RPC functions:");
  for (const r of rpcs) {
    try {
      const res = await fetch(`${url}/rest/v1/rpc/${r}`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      const txt = await res.text();
      // If error is missing parameter, the function EXISTS! (404 means missing function)
      if (res.status === 404) {
        console.log(`❌ RPC '${r}': NOT FOUND (404)`);
      } else {
        console.log(`✅ RPC '${r}': EXISTS (${res.status} ${txt.slice(0, 60)})`);
      }
    } catch (err) {
      console.log(`❌ RPC '${r}': ${err.message}`);
    }
  }
}

runCheck();
