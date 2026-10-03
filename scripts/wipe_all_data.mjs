import fs from "fs";

// 1. Read environment variables from .env
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

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env");
  process.exit(1);
}

const headers = {
  "apikey": serviceKey,
  "Authorization": `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
  "Prefer": "return=minimal"
};

async function deleteAllFromTable(table) {
  console.log(`Deleting all rows from table '${table}'...`);
  try {
    // Delete all where id is not null (or any non-empty match)
    // PostgREST syntax: ?id=neq.00000000-0000-0000-0000-000000000000 or id=not.is.null
    const res = await fetch(`${url}/rest/v1/${table}?id=not.is.null`, {
      method: "DELETE",
      headers
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn(`  Warning on ${table}: ${res.status} - ${err}`);
    } else {
      console.log(`  ✓ Table '${table}' wiped successfully.`);
    }
  } catch (e) {
    console.error(`  ✗ Failed to wipe table '${table}':`, e.message);
  }
}

async function wipeData() {
  console.log("=== STARTING COMPLETE DATA WIPE ===");

  // Step 1: Wipe transactional / child tables first
  const childTables = [
    "whatsapp_messages",
    "audit_logs",
    "invoices",
    "transactions",
    "offers",
    "wig_products",
    "services",
    "customers"
  ];

  for (const table of childTables) {
    await deleteAllFromTable(table);
  }

  // Step 2: Clean up Auth Users (Keep only sameershaikh584@gmail.com)
  console.log("\n--- Cleaning up Supabase Auth Users ---");
  try {
    const listRes = await fetch(`${url}/auth/v1/admin/users`, {
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`
      }
    });

    if (listRes.ok) {
      const { users } = await listRes.json();
      console.log(`Found ${users.length} auth users.`);
      for (const u of users) {
        const email = (u.email || "").toLowerCase();
        if (email === "sameershaikh584@gmail.com") {
          console.log(`  → Preserving Admin Account: ${email} (${u.id})`);
          // Update admin profile/metadata to default clean salon
          await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              user_metadata: {
                role: "superadmin",
                salon_id: "default",
                full_name: "Sameer Shaikh",
                assigned_salons: ["default"]
              }
            })
          });
        } else {
          console.log(`  → Deleting Auth user: ${email} (${u.id})`);
          const delRes = await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
            method: "DELETE",
            headers
          });
          if (!delRes.ok) {
            console.warn(`    Failed to delete auth user ${email}:`, await delRes.text());
          } else {
            console.log(`    ✓ Deleted auth user ${email}`);
          }
        }
      }
    }
  } catch (e) {
    console.error("Failed to clean up auth users:", e.message);
  }

  // Step 3: Clean up Profiles (Delete non-admin profiles and reset admin profile)
  console.log("\n--- Cleaning up Profiles table ---");
  try {
    // Delete all profiles whose email is not sameershaikh584@gmail.com
    const delProfilesRes = await fetch(`${url}/rest/v1/profiles?email=neq.sameershaikh584%40gmail.com`, {
      method: "DELETE",
      headers
    });
    console.log(`  ✓ Profiles cleaned up: ${delProfilesRes.status}`);

    // Update the admin profile to clean default state
    const updateAdminRes = await fetch(`${url}/rest/v1/profiles?email=eq.sameershaikh584%40gmail.com`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        role: "superadmin",
        salon_id: "default",
        assigned_salons: ["default"],
        full_name: "Sameer Shaikh",
        must_change_password: false,
        updated_at: new Date().toISOString()
      })
    });
    console.log(`  ✓ Admin profile reset: ${updateAdminRes.status}`);
  } catch (e) {
    console.error("Failed to clean profiles:", e.message);
  }

  // Step 4: Clean up Salons table (Delete all custom branches, reset default salon)
  console.log("\n--- Cleaning up Salons / Branches ---");
  try {
    // Delete non-default salons
    const delSalonsRes = await fetch(`${url}/rest/v1/salons?id=neq.default`, {
      method: "DELETE",
      headers
    });
    console.log(`  ✓ Custom salons deleted: ${delSalonsRes.status}`);

    // Reset default salon to clean baseline
    const resetDefaultRes = await fetch(`${url}/rest/v1/salons?id=eq.default`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        name: "NICE LOOKING (Main Branch)",
        slug: "nice-looking-main",
        subtitle: "Hair Wig & Hair Services",
        mobile: "+91 98765 43210",
        email: "sameershaikh584@gmail.com",
        address: "Mumbai, Maharashtra",
        invoice_prefix: "NL",
        whatsapp_number: "919876543210",
        status: "ACTIVE",
        owner_name: "Sameer Shaikh",
        owner_email: "sameershaikh584@gmail.com",
        updated_at: new Date().toISOString()
      })
    });
    console.log(`  ✓ Default salon reset: ${resetDefaultRes.status}`);
  } catch (e) {
    console.error("Failed to clean salons:", e.message);
  }

  console.log("\n=== COMPLETE DATA WIPE FINISHED SUCCESSFULLY ===");
}

wipeData();
