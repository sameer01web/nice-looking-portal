-- =====================================================================
-- NICE LOOKING Multi-Tenant - Complete Data Wipe & Fresh Baseline Script
-- This script wipes all transaction, customer, product, invoice, audit logs,
-- custom branch records, and resets the database to a clean single default branch.
-- =====================================================================

-- 1. Truncate all transactional & catalog child tables
truncate table public.whatsapp_messages restart identity cascade;
truncate table public.audit_logs restart identity cascade;
truncate table public.invoices restart identity cascade;
truncate table public.transactions restart identity cascade;
truncate table public.offers restart identity cascade;
truncate table public.wig_products restart identity cascade;
truncate table public.services restart identity cascade;
truncate table public.customers restart identity cascade;

-- 2. Delete non-admin profiles (Keep superadmin sameershaikh584@gmail.com)
delete from public.profiles
where email != 'sameershaikh584@gmail.com';

-- 3. Delete all custom salons / branches (Keep only 'default' branch)
delete from public.salons
where id != 'default';

-- 4. Reset default salon to clean baseline
insert into public.salons (id, name, slug, subtitle, mobile, email, address, invoice_prefix, whatsapp_number, status, owner_name, owner_email)
values (
  'default',
  'NICE LOOKING (Main Branch)',
  'nice-looking-main',
  'Hair Wig & Hair Services',
  '+91 98765 43210',
  'sameershaikh584@gmail.com',
  'Shop 4, Hill Road, Bandra West, Mumbai',
  'NL',
  '919876543210',
  'ACTIVE',
  'Sameer Shaikh',
  'sameershaikh584@gmail.com'
)
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  subtitle = excluded.subtitle,
  mobile = excluded.mobile,
  email = excluded.email,
  address = excluded.address,
  invoice_prefix = excluded.invoice_prefix,
  whatsapp_number = excluded.whatsapp_number,
  status = excluded.status,
  owner_name = excluded.owner_name,
  owner_email = excluded.owner_email,
  updated_at = now();

-- 5. Reset Admin profile
update public.profiles
set
  role = 'superadmin',
  salon_id = 'default',
  assigned_salons = array['default']::text[],
  full_name = 'Sameer Shaikh',
  must_change_password = false,
  updated_at = now()
where email = 'sameershaikh584@gmail.com';

-- 6. Insert clean standard default services catalog
insert into public.services (salon_id, name, active)
values
  ('default', 'Hair Wig', true),
  ('default', 'Wig Service', true),
  ('default', 'Hair Color', true),
  ('default', 'Hair Treatment', true),
  ('default', 'Hair Consultation', true),
  ('default', 'Double Tap', true),
  ('default', 'Hair Serum', true),
  ('default', 'Other', true)
on conflict do nothing;
