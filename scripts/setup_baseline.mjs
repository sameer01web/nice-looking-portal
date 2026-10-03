import fs from "fs";

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
const serviceKey = env.SUPABASE_SECRET_KEY;

const headers = {
  "apikey": serviceKey,
  "Authorization": `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
  "Prefer": "resolution=merge-duplicates"
};

async function setupBaseline() {
  // 1. Upsert default salon
  console.log("Upserting default salon...");
  await fetch(`${url}/rest/v1/salons`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: "default",
      name: "NICE LOOKING (Main Branch)",
      slug: "nice-looking-main",
      subtitle: "Hair Wig & Hair Services",
      mobile: "+91 98765 43210",
      email: "sameershaikh584@gmail.com",
      address: "Shop 4, Hill Road, Bandra West, Mumbai",
      invoice_prefix: "NL",
      whatsapp_number: "919876543210",
      status: "ACTIVE",
      owner_name: "Sameer Shaikh",
      owner_email: "sameershaikh584@gmail.com",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  });

  // 2. Upsert admin profile for 779f402b-aebb-421b-9d11-554d1e40cfaf
  console.log("Upserting admin profile...");
  const profRes = await fetch(`${url}/rest/v1/profiles`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: "779f402b-aebb-421b-9d11-554d1e40cfaf",
      email: "sameershaikh584@gmail.com",
      full_name: "Sameer Shaikh",
      role: "superadmin",
      salon_id: "default",
      assigned_salons: ["default"],
      must_change_password: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  });
  console.log("Admin profile status:", profRes.status, await profRes.text());

  // 3. Upsert standard default services
  console.log("Upserting standard default services...");
  const services = [
    { salon_id: "default", name: "Hair Wig", active: true },
    { salon_id: "default", name: "Wig Service", active: true },
    { salon_id: "default", name: "Hair Color", active: true },
    { salon_id: "default", name: "Hair Treatment", active: true },
    { salon_id: "default", name: "Hair Consultation", active: true },
    { salon_id: "default", name: "Double Tap", active: true },
    { salon_id: "default", name: "Hair Serum", active: true },
    { salon_id: "default", name: "Other", active: true }
  ];

  for (const s of services) {
    await fetch(`${url}/rest/v1/services`, {
      method: "POST",
      headers,
      body: JSON.stringify(s)
    });
  }

  console.log("Baseline setup complete.");
}

setupBaseline();
