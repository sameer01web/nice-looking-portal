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
const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_ANON_KEY;

async function checkAuthUsers() {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`
    }
  });

  if (!res.ok) {
    console.error("Auth admin request failed:", res.status, await res.text());
    return;
  }

  const data = await res.json();
  console.log("Auth Users count:", data.users?.length);
  if (data.users) {
    console.log("Users:", data.users.map(u => ({
      id: u.id,
      email: u.email,
      role: u.user_metadata?.role,
      salon_id: u.user_metadata?.salon_id,
      name: u.user_metadata?.full_name || u.user_metadata?.name
    })));
  }
}

checkAuthUsers();
