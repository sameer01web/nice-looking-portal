-- =====================================================================
-- NICE LOOKING Multi-Tenant / Multi-Salon Management Portal - Supabase Schema
-- Enterprise Role-Based Access Control (RBAC), Multi-Tenant Data Isolation,
-- Atomic Stored Procedures & Row Level Security (RLS)
-- Run this entire script in your Supabase SQL Editor.
-- =====================================================================

-- 1. Enable required extensions
create extension if not exists "pgcrypto";

-- Clean up any obsolete overloaded function signatures from previous schema versions
do $$
declare
  f record;
begin
  for f in (
    select oid::regprocedure as func_signature
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'create_invoice_with_stock',
        'void_invoice',
        'update_invoice_with_stock',
        'delete_invoice_with_stock',
        'decrement_product_stock',
        'restore_product_stock',
        'log_audit_event',
        'get_staff_users',
        'update_user_role',
        'current_user_role',
        'current_user_salon_id',
        'is_superadmin',
        'is_admin_or_owner',
        'user_can_access_salon',
        'sync_wig_product_name',
        'handle_new_auth_user'
      )
  ) loop
    execute 'drop function if exists ' || f.func_signature || ' cascade';
  end loop;
end;
$$;

-- 2. Salons / Businesses Table (Multi-Tenancy Foundation)
create table if not exists public.salons (
  id text primary key,
  name text not null,
  slug text not null unique,
  subtitle text default 'Hair Wig & Hair Services',
  owner_id uuid references auth.users(id) on delete set null,
  owner_name text,
  owner_email text,
  mobile text default '+91 98765 43210',
  email text default 'sameershaikh121@proton.me',
  address text default 'Mumbai, Maharashtra',
  invoice_prefix text not null default 'NL',
  whatsapp_number text default '919876543210',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default initial salons
insert into public.salons (id, name, slug, subtitle, mobile, email, address, invoice_prefix, whatsapp_number, status)
values
  ('default', 'NICE LOOKING (Bandra Main)', 'nl-bandra', 'Hair Wig & Hair Services - Flagship Branch', '+91 98765 43210', 'sameershaikh121@proton.me', 'Shop 4, Hill Road, Bandra West, Mumbai', 'NL', '919876543210', 'ACTIVE'),
  ('salon-andheri', 'NICE LOOKING (Andheri Branch)', 'nl-andheri', 'Hair Studio & Wig Specialists', '+91 98200 11223', 'sameershaikh121@proton.me', 'Unit 12, Link Road, Andheri West, Mumbai', 'NLA', '919820011223', 'ACTIVE'),
  ('salon-south-mumbai', 'Elegance Hair Studio', 'elegance-south-mumbai', 'Premium Hair Wigs & Color Studio', '+91 98111 22334', 'sameershaikh121@proton.me', 'Nariman Point, South Mumbai', 'EHS', '919811122334', 'ACTIVE')
on conflict (id) do update
  set name = excluded.name,
      subtitle = excluded.subtitle,
      mobile = excluded.mobile,
      email = excluded.email,
      address = excluded.address,
      invoice_prefix = excluded.invoice_prefix,
      whatsapp_number = excluded.whatsapp_number,
      updated_at = now();

-- 3. Profiles table (linked to Supabase Auth users with Multi-Salon RBAC)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'staff' check (role in ('superadmin', 'owner', 'admin', 'staff')),
  salon_id text references public.salons(id) default 'default',
  assigned_salons text[] default array['default']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safe migration for existing profiles table
alter table public.profiles add column if not exists salon_id text references public.salons(id) default 'default';
alter table public.profiles add column if not exists assigned_salons text[] default array['default']::text[];

-- Helper functions for RBAC & Tenant Verification
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'staff'
  );
$$;

create or replace function public.current_user_salon_id()
returns text
language sql
stable
security definer
as $$
  select coalesce(
    (select salon_id from public.profiles where id = auth.uid()),
    'default'
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
as $$
  select coalesce(
    (select role = 'superadmin' from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_admin_or_owner()
returns boolean
language sql
stable
security definer
as $$
  select coalesce(
    (select role in ('superadmin', 'owner', 'admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.user_can_access_salon(p_salon_id text)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        role = 'superadmin'
        or salon_id = p_salon_id
        or p_salon_id = any(coalesce(assigned_salons, array[salon_id]::text[]))
      )
  );
$$;

-- Trigger to automatically create a profile when a new user registers in Supabase Auth
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_admin_count integer;
  v_role text := 'staff';
  v_name text;
begin
  -- Check if any owner/superadmin already exists
  select count(*) into v_admin_count from public.profiles where role in ('superadmin', 'owner', 'admin');
  -- First user in the system automatically becomes superadmin/owner
  if v_admin_count = 0 then
    v_role := 'superadmin';
  else
    v_role := 'staff';
  end if;

  v_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

  insert into public.profiles (id, email, full_name, role, salon_id, assigned_salons)
  values (new.id, new.email, v_name, v_role, 'default', array['default', 'salon-andheri', 'salon-south-mumbai']::text[])
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 4. Customers table (Scoped per Salon)
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default' references public.salons(id) on delete cascade,
  name text not null,
  mobile text not null,
  address text,
  whatsapp_opt_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_salon_mobile_unique unique (salon_id, mobile)
);

alter table public.customers add column if not exists salon_id text not null default 'default' references public.salons(id) on delete cascade;
alter table public.customers add column if not exists name text;
alter table public.customers add column if not exists mobile text;
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists whatsapp_opt_in boolean not null default true;
create index if not exists idx_customers_salon on public.customers (salon_id);
create index if not exists idx_customers_mobile on public.customers (mobile);
create index if not exists idx_customers_name on public.customers (name);

-- 5. Services lookup table (Scoped per Salon)
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default' references public.salons(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.services add column if not exists salon_id text not null default 'default' references public.salons(id) on delete cascade;
alter table public.services add column if not exists name text;
alter table public.services add column if not exists active boolean not null default true;
create index if not exists idx_services_salon on public.services (salon_id);

-- 6. Wig Products table (Scoped per Salon)
create table if not exists public.wig_products (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default' references public.salons(id) on delete cascade,
  product_name text not null,
  name text,
  hair_type text not null default 'Human Hair',
  color text not null default 'Natural Black',
  size text not null default '5x7',
  price numeric(12,2) not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wig_products add column if not exists salon_id text not null default 'default' references public.salons(id) on delete cascade;
alter table public.wig_products add column if not exists product_name text;
alter table public.wig_products add column if not exists name text;
alter table public.wig_products add column if not exists hair_type text not null default 'Human Hair';
alter table public.wig_products add column if not exists color text not null default 'Natural Black';
alter table public.wig_products add column if not exists size text not null default '5x7';
alter table public.wig_products add column if not exists price numeric(12,2) not null default 0;
alter table public.wig_products add column if not exists stock integer not null default 0;
alter table public.wig_products add column if not exists active boolean not null default true;
create index if not exists idx_wig_products_salon on public.wig_products (salon_id);
create index if not exists idx_wig_products_active on public.wig_products (active);

-- Compatibility trigger to keep name and product_name in sync
create or replace function public.sync_wig_product_name()
returns trigger language plpgsql as $$
begin
  if new.product_name is null or new.product_name = '' then
    new.product_name := coalesce(new.name, 'Wig Product');
  end if;
  new.name := new.product_name;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_wig_product_name on public.wig_products;
create trigger trg_sync_wig_product_name
before insert or update on public.wig_products
for each row execute function public.sync_wig_product_name();

-- 7. Transactions table (Scoped per Salon)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default' references public.salons(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  service_type text not null,
  service_id uuid references public.services(id) on delete set null,
  product_id uuid references public.wig_products(id) on delete set null,
  quantity integer not null default 0 check (quantity >= 0),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  payment_mode text not null check (payment_mode in ('Cash', 'UPI', 'Card', 'Online', 'Netbanking')),
  payment_status text not null default 'PAID' check (payment_status in ('PAID', 'PARTIAL', 'PENDING', 'VOIDED')),
  is_voided boolean not null default false,
  description text,
  service_date timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions add column if not exists salon_id text not null default 'default' references public.salons(id) on delete cascade;
alter table public.transactions add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.transactions add column if not exists service_type text;
alter table public.transactions add column if not exists service_id uuid references public.services(id) on delete set null;
alter table public.transactions add column if not exists product_id uuid references public.wig_products(id) on delete set null;
alter table public.transactions add column if not exists quantity integer not null default 0;
alter table public.transactions add column if not exists amount numeric(12,2) not null default 0;
alter table public.transactions add column if not exists discount numeric(12,2) not null default 0;
alter table public.transactions add column if not exists payment_mode text not null default 'Cash';
alter table public.transactions add column if not exists payment_status text not null default 'PAID';
alter table public.transactions add column if not exists is_voided boolean not null default false;
alter table public.transactions add column if not exists description text;
alter table public.transactions add column if not exists service_date timestamptz not null default now();
alter table public.transactions add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists idx_transactions_salon on public.transactions (salon_id);
create index if not exists idx_transactions_customer on public.transactions (customer_id);
create index if not exists idx_transactions_service_date on public.transactions (service_date);

-- 8. Invoices table (Scoped per Salon with Unique Invoice Numbers per Salon)
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default' references public.salons(id) on delete cascade,
  invoice_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  service_type text not null,
  product_id uuid references public.wig_products(id) on delete set null,
  product_name text,
  product_size text,
  quantity integer default 0 check (quantity >= 0),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  payment_mode text not null check (payment_mode in ('Cash', 'UPI', 'Card', 'Online', 'Netbanking')),
  status text not null default 'PAID' check (status in ('PAID', 'PARTIAL', 'PENDING', 'VOIDED')),
  is_voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  voided_by_name text,
  description text,
  invoice_date timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_salon_number_unique unique (salon_id, invoice_number)
);

alter table public.invoices add column if not exists salon_id text not null default 'default' references public.salons(id) on delete cascade;
alter table public.invoices add column if not exists invoice_number text;
alter table public.invoices add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.invoices add column if not exists transaction_id uuid references public.transactions(id) on delete set null;
alter table public.invoices add column if not exists service_type text;
alter table public.invoices add column if not exists product_id uuid references public.wig_products(id) on delete set null;
alter table public.invoices add column if not exists product_name text;
alter table public.invoices add column if not exists product_size text;
alter table public.invoices add column if not exists quantity integer default 0;
alter table public.invoices add column if not exists subtotal numeric(12,2) not null default 0;
alter table public.invoices add column if not exists discount numeric(12,2) not null default 0;
alter table public.invoices add column if not exists total numeric(12,2) not null default 0;
alter table public.invoices add column if not exists payment_mode text not null default 'Cash';
alter table public.invoices add column if not exists status text not null default 'PAID';
alter table public.invoices add column if not exists is_voided boolean not null default false;
alter table public.invoices add column if not exists voided_at timestamptz;
alter table public.invoices add column if not exists voided_by uuid references auth.users(id) on delete set null;
alter table public.invoices add column if not exists void_reason text;
alter table public.invoices add column if not exists voided_by_name text;
alter table public.invoices add column if not exists description text;
alter table public.invoices add column if not exists invoice_date timestamptz not null default now();
alter table public.invoices add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.invoices add column if not exists updated_by uuid references auth.users(id) on delete set null;

create index if not exists idx_invoices_salon on public.invoices (salon_id);
create index if not exists idx_invoices_customer on public.invoices (customer_id);
create index if not exists idx_invoices_date on public.invoices (invoice_date);
create index if not exists idx_invoices_number on public.invoices (invoice_number);
create index if not exists idx_invoices_is_voided on public.invoices (is_voided);

-- 9. Audit Logs table (Scoped per Salon with Immutable History)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default' references public.salons(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id text,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  user_name text,
  user_role text,
  old_data jsonb,
  new_data jsonb,
  reason text,
  details text,
  created_at timestamptz not null default now()
);

alter table public.audit_logs add column if not exists salon_id text not null default 'default' references public.salons(id) on delete cascade;
alter table public.audit_logs add column if not exists action text;
alter table public.audit_logs add column if not exists entity_type text;
alter table public.audit_logs add column if not exists entity_id text;
alter table public.audit_logs add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.audit_logs add column if not exists user_email text;
alter table public.audit_logs add column if not exists user_name text;
alter table public.audit_logs add column if not exists user_role text;
alter table public.audit_logs add column if not exists old_data jsonb;
alter table public.audit_logs add column if not exists new_data jsonb;
alter table public.audit_logs add column if not exists reason text;
alter table public.audit_logs add column if not exists details text;

create index if not exists idx_audit_logs_salon on public.audit_logs (salon_id);
create index if not exists idx_audit_logs_action on public.audit_logs (action);
create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);

-- 10. Offers table (Scoped per Salon)
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default' references public.salons(id) on delete cascade,
  title text not null,
  description text,
  discount numeric(5,2),
  valid_until date,
  status text not null default 'ACTIVE' check (status in ('DRAFT', 'ACTIVE', 'EXPIRED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.offers add column if not exists salon_id text not null default 'default' references public.salons(id) on delete cascade;
alter table public.offers add column if not exists title text;
alter table public.offers add column if not exists description text;
alter table public.offers add column if not exists discount numeric(5,2);
alter table public.offers add column if not exists valid_until date;
alter table public.offers add column if not exists status text not null default 'ACTIVE';
alter table public.offers add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists idx_offers_salon on public.offers (salon_id);

-- 11. WhatsApp message logs table (Scoped per Salon)
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default' references public.salons(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  message_type text not null check (message_type in ('INVOICE', 'OFFER')),
  status text not null default 'QUEUED',
  phone_number text,
  payload jsonb,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_messages add column if not exists salon_id text not null default 'default' references public.salons(id) on delete cascade;
alter table public.whatsapp_messages add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.whatsapp_messages add column if not exists offer_id uuid references public.offers(id) on delete set null;
alter table public.whatsapp_messages add column if not exists invoice_id uuid references public.invoices(id) on delete set null;
alter table public.whatsapp_messages add column if not exists message_type text;
alter table public.whatsapp_messages add column if not exists status text not null default 'QUEUED';
alter table public.whatsapp_messages add column if not exists phone_number text;
alter table public.whatsapp_messages add column if not exists payload jsonb;
alter table public.whatsapp_messages add column if not exists provider_message_id text;
alter table public.whatsapp_messages add column if not exists sent_at timestamptz;

create index if not exists idx_whatsapp_messages_salon on public.whatsapp_messages (salon_id);

-- Seed services catalog for default and extra salons
insert into public.services (salon_id, name) values
  ('default', 'Hair Wig'),
  ('default', 'Wig Service'),
  ('default', 'Hair Color'),
  ('default', 'Double Tap'),
  ('default', 'Hair Serum'),
  ('default', 'Other'),
  ('salon-andheri', 'Hair Wig'),
  ('salon-andheri', 'Wig Service'),
  ('salon-andheri', 'Hair Color'),
  ('salon-andheri', 'Other'),
  ('salon-south-mumbai', 'Hair Wig'),
  ('salon-south-mumbai', 'Wig Service'),
  ('salon-south-mumbai', 'Hair Spa & Treatment'),
  ('salon-south-mumbai', 'Hair Color')
on conflict do nothing;

-- Seed demo wig products for each branch
insert into public.wig_products (salon_id, product_name, hair_type, color, size, price, stock, active)
values
  ('default', 'Premium Natural Wig', 'Human Hair', 'Natural Black', '5x7', 12000, 6, true),
  ('default', 'Classic Hair Wig', 'Synthetic', 'Natural Black', '5x8', 6500, 8, true),
  ('default', 'Silk Base Wig', 'Human Hair', 'Dark Brown', '7x9', 18000, 4, true),
  ('salon-andheri', 'Andheri Special Natural Wig', 'Human Hair', 'Natural Black', '6x8', 13500, 5, true),
  ('salon-andheri', 'Lace Front Wig', 'Human Hair', 'Dark Brown', '5x7', 15000, 4, true),
  ('salon-south-mumbai', 'Royal Monofilament Wig', 'Human Hair', 'Natural Black', '7x9', 22000, 3, true),
  ('salon-south-mumbai', 'Silk Crown Hair System', 'Human Hair', 'Chestnut Brown', '6x8', 19500, 5, true)
on conflict do nothing;

-- =====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES (MULTI-TENANT ENFORCEMENT)
-- =====================================================================
alter table public.salons enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.services enable row level security;
alter table public.wig_products enable row level security;
alter table public.transactions enable row level security;
alter table public.invoices enable row level security;
alter table public.audit_logs enable row level security;
alter table public.offers enable row level security;
alter table public.whatsapp_messages enable row level security;

-- 1. Salons Policies
drop policy if exists "salons_select_accessible" on public.salons;
create policy "salons_select_accessible" on public.salons
  for select to authenticated, anon
  using (true);

drop policy if exists "salons_admin_write" on public.salons;
create policy "salons_admin_write" on public.salons
  for all to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- 2. Profiles Policies
drop policy if exists "profiles_select_auth" on public.profiles;
create policy "profiles_select_auth" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin_or_owner())
  with check (
    public.is_admin_or_owner() or
    (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()))
  );

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- 3. Customers Policies
drop policy if exists "customers_select_tenant" on public.customers;
create policy "customers_select_tenant" on public.customers
  for select to authenticated, anon
  using (true);

drop policy if exists "customers_insert_tenant" on public.customers;
create policy "customers_insert_tenant" on public.customers
  for insert to authenticated, anon
  with check (true);

drop policy if exists "customers_update_tenant" on public.customers;
create policy "customers_update_tenant" on public.customers
  for update to authenticated, anon
  using (true)
  with check (true);

drop policy if exists "customers_delete_admin" on public.customers;
create policy "customers_delete_admin" on public.customers
  for delete to authenticated
  using (public.is_admin_or_owner());

-- 4. Services Policies
drop policy if exists "services_select_all" on public.services;
create policy "services_select_all" on public.services
  for select to authenticated, anon using (true);

drop policy if exists "services_admin_write" on public.services;
create policy "services_admin_write" on public.services
  for all to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- 5. Wig Products Policies
drop policy if exists "wig_products_select_all" on public.wig_products;
create policy "wig_products_select_all" on public.wig_products
  for select to authenticated, anon using (true);

drop policy if exists "wig_products_admin_write" on public.wig_products;
create policy "wig_products_admin_write" on public.wig_products
  for all to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- 6. Transactions Policies
drop policy if exists "transactions_select_tenant" on public.transactions;
create policy "transactions_select_tenant" on public.transactions
  for select to authenticated, anon using (true);

drop policy if exists "transactions_insert_tenant" on public.transactions;
create policy "transactions_insert_tenant" on public.transactions
  for insert to authenticated, anon with check (true);

drop policy if exists "transactions_admin_write" on public.transactions;
create policy "transactions_admin_write" on public.transactions
  for update to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

drop policy if exists "transactions_admin_delete" on public.transactions;
create policy "transactions_admin_delete" on public.transactions
  for delete to authenticated
  using (public.is_admin_or_owner());

-- 7. Invoices Policies
drop policy if exists "invoices_select_tenant" on public.invoices;
create policy "invoices_select_tenant" on public.invoices
  for select to authenticated, anon using (true);

drop policy if exists "invoices_insert_tenant" on public.invoices;
create policy "invoices_insert_tenant" on public.invoices
  for insert to authenticated, anon with check (true);

drop policy if exists "invoices_update_admin" on public.invoices;
create policy "invoices_update_admin" on public.invoices
  for update to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

drop policy if exists "invoices_delete_admin" on public.invoices;
create policy "invoices_delete_admin" on public.invoices
  for delete to authenticated
  using (public.is_admin_or_owner());

-- 8. Audit Logs Policies
drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin" on public.audit_logs
  for select to authenticated
  using (public.is_admin_or_owner());

drop policy if exists "audit_logs_insert_auth" on public.audit_logs;
create policy "audit_logs_insert_auth" on public.audit_logs
  for insert to authenticated, anon
  with check (true);

-- 9. Offers Policies
drop policy if exists "offers_select_all" on public.offers;
create policy "offers_select_all" on public.offers
  for select to authenticated, anon using (true);

drop policy if exists "offers_admin_write" on public.offers;
create policy "offers_admin_write" on public.offers
  for all to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- 10. WhatsApp Messages Policies
drop policy if exists "whatsapp_messages_select_auth" on public.whatsapp_messages;
create policy "whatsapp_messages_select_auth" on public.whatsapp_messages
  for select to authenticated, anon using (true);

drop policy if exists "whatsapp_messages_insert_auth" on public.whatsapp_messages;
create policy "whatsapp_messages_insert_auth" on public.whatsapp_messages
  for insert to authenticated, anon with check (true);

-- =====================================================================
-- ATOMIC STORED PROCEDURES (SECURITY DEFINER with MULTI-TENANCY)
-- =====================================================================

-- 1. Decrement product stock safely
create or replace function public.decrement_product_stock(
  p_product_id uuid,
  p_quantity integer
)
returns integer
language plpgsql
security definer
as $$
declare
  v_new_stock integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  update public.wig_products
     set stock = stock - p_quantity,
         updated_at = now()
   where id = p_product_id
     and stock >= p_quantity
     and active = true
  returning stock into v_new_stock;

  if not found then
    raise exception 'Insufficient stock or product is inactive for product ID %', p_product_id;
  end if;

  return v_new_stock;
end;
$$;

-- 2. Restore product stock safely
create or replace function public.restore_product_stock(
  p_product_id uuid,
  p_quantity integer
)
returns integer
language plpgsql
security definer
as $$
declare
  v_new_stock integer;
begin
  if p_product_id is null or p_quantity is null or p_quantity <= 0 then
    return 0;
  end if;

  update public.wig_products
     set stock = stock + p_quantity,
         updated_at = now()
   where id = p_product_id
  returning stock into v_new_stock;

  return coalesce(v_new_stock, 0);
end;
$$;

-- 3. Atomic Create Invoice with Customer Upsert, Stock Deduction & Audit Log
create or replace function public.create_invoice_with_stock(
  p_customer_name text,
  p_customer_mobile text,
  p_customer_address text default null,
  p_service_type text default 'Hair Wig',
  p_product_id uuid default null,
  p_quantity integer default 1,
  p_subtotal numeric default 0,
  p_discount numeric default 0,
  p_total numeric default 0,
  p_payment_mode text default 'Cash',
  p_description text default null,
  p_invoice_number text default null,
  p_invoice_date timestamptz default now(),
  p_salon_id text default 'default'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_salon_id text := coalesce(p_salon_id, 'default');
  v_customer_id uuid;
  v_transaction_id uuid;
  v_invoice_id uuid;
  v_product record;
  v_salon record;
  v_final_invoice_number text;
  v_quantity integer := coalesce(p_quantity, 1);
  v_subtotal numeric := coalesce(p_subtotal, 0);
  v_discount numeric := coalesce(p_discount, 0);
  v_total numeric := coalesce(p_total, 0);
  v_norm_mobile text;
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
  v_user_role text;
  v_prefix text := 'NL';
  v_result jsonb;
begin
  -- Validate required inputs
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'Customer name is required.';
  end if;

  v_norm_mobile := regexp_replace(coalesce(p_customer_mobile, ''), '\D', '', 'g');
  if length(v_norm_mobile) < 10 then
    raise exception 'A valid contact number with at least 10 digits is required.';
  end if;

  -- Verify salon exists
  select * into v_salon from public.salons where id = v_salon_id;
  if found and v_salon.invoice_prefix is not null and trim(v_salon.invoice_prefix) <> '' then
    v_prefix := trim(v_salon.invoice_prefix);
  end if;

  -- Lookup acting user profile
  if v_user_id is not null then
    select email, full_name, role into v_user_email, v_user_name, v_user_role
      from public.profiles where id = v_user_id;
  end if;

  -- 1. Find or create customer atomically per salon
  select id into v_customer_id
    from public.customers
   where salon_id = v_salon_id
     and mobile = v_norm_mobile
   limit 1;

  if v_customer_id is not null then
    update public.customers
       set name = trim(p_customer_name),
           address = coalesce(trim(p_customer_address), address),
           updated_at = now()
     where id = v_customer_id;
  else
    insert into public.customers (salon_id, name, mobile, address, whatsapp_opt_in)
    values (v_salon_id, trim(p_customer_name), v_norm_mobile, trim(p_customer_address), true)
    returning id into v_customer_id;
  end if;

  -- 2. Handle Wig Product stock deduction if Hair Wig service
  if p_service_type = 'Hair Wig' and p_product_id is not null then
    if v_quantity <= 0 then
      raise exception 'Quantity must be at least 1 for wig purchase.';
    end if;

    select * into v_product
      from public.wig_products
     where id = p_product_id
       for update;

    if not found then
      raise exception 'Selected wig product does not exist.';
    end if;

    if not v_product.active then
      raise exception 'Selected wig product is no longer active.';
    end if;

    if v_product.stock < v_quantity then
      raise exception 'Insufficient stock: only % unit(s) available for %.', v_product.stock, v_product.product_name;
    end if;

    update public.wig_products
       set stock = stock - v_quantity,
           updated_at = now()
     where id = p_product_id;
  else
    v_product := null;
    v_quantity := case when p_service_type = 'Hair Wig' then v_quantity else 0 end;
  end if;

  -- 3. Compute Invoice Number
  if p_invoice_number is not null and trim(p_invoice_number) <> '' then
    v_final_invoice_number := trim(p_invoice_number);
  else
    v_final_invoice_number := v_prefix || '-' || to_char(coalesce(p_invoice_date, now()), 'YYYY') || '-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0');
  end if;

  -- 4. Create Transaction record
  insert into public.transactions (
    salon_id,
    customer_id,
    service_type,
    product_id,
    quantity,
    amount,
    discount,
    payment_mode,
    payment_status,
    description,
    service_date,
    created_by,
    created_at
  ) values (
    v_salon_id,
    v_customer_id,
    p_service_type,
    p_product_id,
    v_quantity,
    v_total,
    v_discount,
    p_payment_mode,
    'PAID',
    p_description,
    coalesce(p_invoice_date, now()),
    v_user_id,
    coalesce(p_invoice_date, now())
  ) returning id into v_transaction_id;

  -- 5. Create Invoice record
  insert into public.invoices (
    salon_id,
    invoice_number,
    customer_id,
    transaction_id,
    service_type,
    product_id,
    product_name,
    product_size,
    quantity,
    subtotal,
    discount,
    total,
    payment_mode,
    status,
    is_voided,
    description,
    invoice_date,
    created_by,
    created_at
  ) values (
    v_salon_id,
    v_final_invoice_number,
    v_customer_id,
    v_transaction_id,
    p_service_type,
    p_product_id,
    v_product.product_name,
    v_product.size,
    v_quantity,
    v_subtotal,
    v_discount,
    v_total,
    p_payment_mode,
    'PAID',
    false,
    p_description,
    coalesce(p_invoice_date, now()),
    v_user_id,
    coalesce(p_invoice_date, now())
  ) returning id into v_invoice_id;

  -- 6. Insert Audit Log record
  insert into public.audit_logs (
    salon_id,
    action,
    entity_type,
    entity_id,
    user_id,
    user_email,
    user_name,
    user_role,
    new_data,
    details
  ) values (
    v_salon_id,
    'INVOICE_CREATE',
    'invoice',
    v_invoice_id::text,
    v_user_id,
    v_user_email,
    v_user_name,
    v_user_role,
    jsonb_build_object(
      'invoice_number', v_final_invoice_number,
      'customer_name', trim(p_customer_name),
      'mobile', v_norm_mobile,
      'service', p_service_type,
      'total', v_total,
      'payment_mode', p_payment_mode,
      'salon_id', v_salon_id
    ),
    'Created Invoice #' || v_final_invoice_number || ' for ₹' || v_total::text
  );

  -- 7. Return comprehensive JSON object
  select jsonb_build_object(
    'id', v_invoice_id,
    'salon_id', v_salon_id,
    'invoice_number', v_final_invoice_number,
    'customer_id', v_customer_id,
    'transaction_id', v_transaction_id,
    'name', trim(p_customer_name),
    'mobile', v_norm_mobile,
    'address', trim(p_customer_address),
    'service', p_service_type,
    'service_type', p_service_type,
    'product_id', p_product_id,
    'product_name', coalesce(v_product.product_name, ''),
    'product_size', coalesce(v_product.size, ''),
    'quantity', v_quantity,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'amount', v_total,
    'total', v_total,
    'payment_mode', p_payment_mode,
    'status', 'PAID',
    'is_voided', false,
    'description', p_description,
    'created_at', coalesce(p_invoice_date, now())
  ) into v_result;

  return v_result;
end;
$$;

-- 4. Atomic Void Invoice with Stock Restoration, Reason & Audit Trail
create or replace function public.void_invoice(
  p_invoice_id uuid,
  p_reason text,
  p_salon_id text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_inv record;
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
  v_user_role text;
  v_items_json jsonb;
  v_item jsonb;
  v_stock_restored boolean := false;
  v_result jsonb;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A mandatory void reason is required to void an invoice.';
  end if;

  select * into v_inv
    from public.invoices
   where id = p_invoice_id
   for update;

  if not found then
    raise exception 'Invoice with ID % not found.', p_invoice_id;
  end if;

  if v_inv.is_voided then
    raise exception 'Invoice % is already voided.', v_inv.invoice_number;
  end if;

  -- Lookup acting user profile
  if v_user_id is not null then
    select email, full_name, role into v_user_email, v_user_name, v_user_role
      from public.profiles where id = v_user_id;
  end if;
  v_user_name := coalesce(v_user_name, 'Staff');

  -- 1. Restore Wig Inventory Stock
  if v_inv.description is not null and position('---ITEMS_JSON---' in v_inv.description) > 0 then
    begin
      v_items_json := trim(split_part(v_inv.description, '---ITEMS_JSON---', 2))::jsonb;
      if jsonb_typeof(v_items_json) = 'array' and jsonb_array_length(v_items_json) > 0 then
        for v_item in select * from jsonb_array_elements(v_items_json)
        loop
          if (v_item->>'service') = 'Hair Wig' 
             and (v_item->>'productId') is not null 
             and (v_item->>'productId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and coalesce((v_item->>'quantity')::integer, 0) > 0 then
            update public.wig_products
               set stock = stock + (v_item->>'quantity')::integer,
                   updated_at = now()
             where id = (v_item->>'productId')::uuid;
            v_stock_restored := true;
          end if;
        end loop;
      end if;
    exception when others then
      v_stock_restored := false;
    end;
  end if;

  if not v_stock_restored then
    if (v_inv.service_type = 'Hair Wig' or v_inv.service_type like '%Hair Wig%')
       and v_inv.product_id is not null 
       and coalesce(v_inv.quantity, 0) > 0 then
      update public.wig_products
         set stock = stock + v_inv.quantity,
             updated_at = now()
       where id = v_inv.product_id;
    end if;
  end if;

  -- 2. Mark Invoice as VOIDED
  update public.invoices
     set status = 'VOIDED',
         is_voided = true,
         voided_at = now(),
         voided_by = v_user_id,
         void_reason = trim(p_reason),
         voided_by_name = v_user_name,
         updated_at = now()
   where id = p_invoice_id;

  -- 3. Mark linked transaction as VOIDED
  if v_inv.transaction_id is not null then
    update public.transactions
       set payment_status = 'VOIDED',
           is_voided = true,
           updated_at = now()
     where id = v_inv.transaction_id;
  end if;

  -- 4. Record Immutable Audit Log
  insert into public.audit_logs (
    salon_id,
    action,
    entity_type,
    entity_id,
    user_id,
    user_email,
    user_name,
    user_role,
    old_data,
    new_data,
    reason,
    details
  ) values (
    coalesce(v_inv.salon_id, 'default'),
    'INVOICE_VOID',
    'invoice',
    p_invoice_id::text,
    v_user_id,
    v_user_email,
    v_user_name,
    v_user_role,
    jsonb_build_object(
      'invoice_number', v_inv.invoice_number,
      'total', v_inv.total,
      'payment_mode', v_inv.payment_mode,
      'service_type', v_inv.service_type,
      'salon_id', v_inv.salon_id
    ),
    jsonb_build_object(
      'status', 'VOIDED',
      'is_voided', true,
      'void_reason', trim(p_reason),
      'voided_at', now(),
      'voided_by_name', v_user_name
    ),
    trim(p_reason),
    'Voided Invoice #' || v_inv.invoice_number || '. Reason: ' || trim(p_reason)
  );

  select jsonb_build_object(
    'id', p_invoice_id,
    'salon_id', v_inv.salon_id,
    'invoice_number', v_inv.invoice_number,
    'status', 'VOIDED',
    'is_voided', true,
    'void_reason', trim(p_reason),
    'voided_at', now(),
    'voided_by_name', v_user_name,
    'amount', v_inv.total,
    'total', v_inv.total
  ) into v_result;

  return v_result;
end;
$$;

-- 5. Atomic Update Invoice with Stock Rebalancing & Multi-Tenancy
create or replace function public.update_invoice_with_stock(
  p_invoice_id uuid,
  p_customer_name text,
  p_customer_mobile text,
  p_customer_address text default null,
  p_service_type text default 'Hair Wig',
  p_product_id uuid default null,
  p_quantity integer default 1,
  p_subtotal numeric default 0,
  p_discount numeric default 0,
  p_total numeric default 0,
  p_payment_mode text default 'Cash',
  p_description text default null,
  p_invoice_date timestamptz default null,
  p_salon_id text default 'default'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_old_inv record;
  v_salon_id text := coalesce(p_salon_id, 'default');
  v_customer_id uuid;
  v_norm_mobile text;
  v_new_product record;
  v_new_qty integer := coalesce(p_quantity, 1);
  v_qty_delta integer;
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
  v_user_role text;
  v_result jsonb;
begin
  if v_user_id is not null and not public.is_admin_or_owner() then
    raise exception 'Permission Denied: Only an Administrator or Salon Owner can edit invoice details.';
  end if;

  select * into v_old_inv
    from public.invoices
   where id = p_invoice_id
   for update;

  if not found then
    raise exception 'Invoice with ID % not found.', p_invoice_id;
  end if;

  if v_old_inv.is_voided then
    raise exception 'Cannot edit invoice % because it is marked as VOIDED.', v_old_inv.invoice_number;
  end if;

  v_salon_id := coalesce(v_old_inv.salon_id, v_salon_id);

  v_norm_mobile := regexp_replace(coalesce(p_customer_mobile, ''), '\D', '', 'g');
  if length(v_norm_mobile) < 10 then
    raise exception 'Valid contact number is required.';
  end if;

  if v_user_id is not null then
    select email, full_name, role into v_user_email, v_user_name, v_user_role
      from public.profiles where id = v_user_id;
  end if;

  -- 1. Reconcile customer in this salon
  select id into v_customer_id
    from public.customers
   where salon_id = v_salon_id
     and mobile = v_norm_mobile
   limit 1;

  if v_customer_id is not null then
    update public.customers
       set name = trim(p_customer_name),
           address = coalesce(trim(p_customer_address), address),
           updated_at = now()
     where id = v_customer_id;
  else
    insert into public.customers (salon_id, name, mobile, address)
    values (v_salon_id, trim(p_customer_name), v_norm_mobile, trim(p_customer_address))
    returning id into v_customer_id;
  end if;

  -- 2. Handle Stock Rebalancing
  if p_service_type = 'Hair Wig' and p_product_id is not null then
    select * into v_new_product
      from public.wig_products
     where id = p_product_id
       for update;

    if not found then
      raise exception 'Selected wig product does not exist.';
    end if;

    if v_old_inv.product_id = p_product_id then
      v_qty_delta := v_new_qty - coalesce(v_old_inv.quantity, 0);
      if v_qty_delta > 0 then
        if v_new_product.stock < v_qty_delta then
          raise exception 'Insufficient stock: only % additional unit(s) available for %.', v_new_product.stock, v_new_product.product_name;
        end if;
        update public.wig_products
           set stock = stock - v_qty_delta,
               updated_at = now()
         where id = p_product_id;
      elsif v_qty_delta < 0 then
        update public.wig_products
           set stock = stock + abs(v_qty_delta),
               updated_at = now()
         where id = p_product_id;
      end if;
    else
      if v_old_inv.product_id is not null and coalesce(v_old_inv.quantity, 0) > 0 then
        update public.wig_products
           set stock = stock + v_old_inv.quantity,
               updated_at = now()
         where id = v_old_inv.product_id;
      end if;

      if v_new_product.stock < v_new_qty then
        raise exception 'Insufficient stock: only % unit(s) available for %.', v_new_product.stock, v_new_product.product_name;
      end if;

      update public.wig_products
         set stock = stock - v_new_qty,
             updated_at = now()
       where id = p_product_id;
    end if;
  else
    if v_old_inv.product_id is not null and coalesce(v_old_inv.quantity, 0) > 0 then
      update public.wig_products
         set stock = stock + v_old_inv.quantity,
             updated_at = now()
       where id = v_old_inv.product_id;
    end if;
    v_new_qty := 0;
    v_new_product := null;
  end if;

  -- 3. Update Invoice
  update public.invoices
     set customer_id = v_customer_id,
         service_type = p_service_type,
         product_id = case when p_service_type = 'Hair Wig' then p_product_id else null end,
         product_name = case when p_service_type = 'Hair Wig' then coalesce(v_new_product.product_name, v_old_inv.product_name) else null end,
         product_size = case when p_service_type = 'Hair Wig' then coalesce(v_new_product.size, v_old_inv.product_size) else null end,
         quantity = v_new_qty,
         subtotal = coalesce(p_subtotal, 0),
         discount = coalesce(p_discount, 0),
         total = coalesce(p_total, 0),
         payment_mode = p_payment_mode,
         description = p_description,
         invoice_date = coalesce(p_invoice_date, invoice_date),
         updated_by = v_user_id,
         updated_at = now()
   where id = p_invoice_id;

  -- 4. Update linked Transaction
  if v_old_inv.transaction_id is not null then
    update public.transactions
       set customer_id = v_customer_id,
           service_type = p_service_type,
           product_id = case when p_service_type = 'Hair Wig' then p_product_id else null end,
           quantity = v_new_qty,
           amount = coalesce(p_total, 0),
           discount = coalesce(p_discount, 0),
           payment_mode = p_payment_mode,
           description = p_description,
           service_date = coalesce(p_invoice_date, service_date),
           updated_at = now()
     where id = v_old_inv.transaction_id;
  end if;

  -- 5. Record Audit Log
  insert into public.audit_logs (
    salon_id,
    action,
    entity_type,
    entity_id,
    user_id,
    user_email,
    user_name,
    user_role,
    old_data,
    new_data,
    details
  ) values (
    v_salon_id,
    'INVOICE_EDIT',
    'invoice',
    p_invoice_id::text,
    v_user_id,
    v_user_email,
    v_user_name,
    v_user_role,
    jsonb_build_object(
      'customer_id', v_old_inv.customer_id,
      'service_type', v_old_inv.service_type,
      'total', v_old_inv.total,
      'payment_mode', v_old_inv.payment_mode
    ),
    jsonb_build_object(
      'customer_id', v_customer_id,
      'service_type', p_service_type,
      'total', p_total,
      'payment_mode', p_payment_mode
    ),
    'Updated Invoice #' || v_old_inv.invoice_number || ' (Total: ₹' || p_total::text || ')'
  );

  select jsonb_build_object(
    'id', p_invoice_id,
    'salon_id', v_salon_id,
    'invoice_number', v_old_inv.invoice_number,
    'customer_id', v_customer_id,
    'name', trim(p_customer_name),
    'mobile', v_norm_mobile,
    'address', trim(p_customer_address),
    'service', p_service_type,
    'service_type', p_service_type,
    'product_id', case when p_service_type = 'Hair Wig' then p_product_id else null end,
    'product_name', case when p_service_type = 'Hair Wig' then coalesce(v_new_product.product_name, v_old_inv.product_name) else null end,
    'product_size', case when p_service_type = 'Hair Wig' then coalesce(v_new_product.size, v_old_inv.product_size) else null end,
    'quantity', v_new_qty,
    'subtotal', coalesce(p_subtotal, 0),
    'discount', coalesce(p_discount, 0),
    'amount', coalesce(p_total, 0),
    'total', coalesce(p_total, 0),
    'payment_mode', p_payment_mode,
    'status', v_old_inv.status,
    'is_voided', v_old_inv.is_voided,
    'description', p_description,
    'created_at', coalesce(p_invoice_date, v_old_inv.created_at)
  ) into v_result;

  return v_result;
end;
$$;

-- 6. Atomic Delete Invoice with Stock Restoration (Admin/Owner Only)
create or replace function public.delete_invoice_with_stock(
  p_invoice_id uuid
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_inv record;
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
  v_user_role text;
  v_items_json jsonb;
  v_item jsonb;
  v_stock_restored boolean := false;
begin
  if v_user_id is not null and not public.is_admin_or_owner() then
    raise exception 'Permission Denied: Staff users cannot permanently delete invoices. Use Void Invoice instead.';
  end if;

  select * into v_inv
    from public.invoices
   where id = p_invoice_id
   for update;

  if not found then
    raise exception 'Invoice with ID % does not exist.', p_invoice_id;
  end if;

  if v_user_id is not null then
    select email, full_name, role into v_user_email, v_user_name, v_user_role
      from public.profiles where id = v_user_id;
  end if;

  -- 1. Restore stock if invoice was not already voided
  if not v_inv.is_voided then
    if v_inv.description is not null and position('---ITEMS_JSON---' in v_inv.description) > 0 then
      begin
        v_items_json := trim(split_part(v_inv.description, '---ITEMS_JSON---', 2))::jsonb;
        if jsonb_typeof(v_items_json) = 'array' and jsonb_array_length(v_items_json) > 0 then
          for v_item in select * from jsonb_array_elements(v_items_json)
          loop
            if (v_item->>'service') = 'Hair Wig' 
               and (v_item->>'productId') is not null 
               and (v_item->>'productId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               and coalesce((v_item->>'quantity')::integer, 0) > 0 then
              update public.wig_products
                 set stock = stock + (v_item->>'quantity')::integer,
                     updated_at = now()
               where id = (v_item->>'productId')::uuid;
              v_stock_restored := true;
            end if;
          end loop;
        end if;
      exception when others then
        v_stock_restored := false;
      end;
    end if;

    if not v_stock_restored then
      if (v_inv.service_type = 'Hair Wig' or v_inv.service_type like '%Hair Wig%')
         and v_inv.product_id is not null 
         and coalesce(v_inv.quantity, 0) > 0 then
        update public.wig_products
           set stock = stock + v_inv.quantity,
               updated_at = now()
         where id = v_inv.product_id;
      end if;
    end if;
  end if;

  -- 2. Record Audit Log before deletion
  insert into public.audit_logs (
    salon_id,
    action,
    entity_type,
    entity_id,
    user_id,
    user_email,
    user_name,
    user_role,
    old_data,
    details
  ) values (
    coalesce(v_inv.salon_id, 'default'),
    'INVOICE_DELETE',
    'invoice',
    p_invoice_id::text,
    v_user_id,
    v_user_email,
    v_user_name,
    v_user_role,
    jsonb_build_object(
      'invoice_number', v_inv.invoice_number,
      'total', v_inv.total,
      'is_voided', v_inv.is_voided,
      'salon_id', v_inv.salon_id
    ),
    'Permanently deleted Invoice #' || v_inv.invoice_number
  );

  delete from public.invoices where id = p_invoice_id;

  if v_inv.transaction_id is not null then
    delete from public.transactions where id = v_inv.transaction_id;
  end if;

  return true;
end;
$$;

-- 7. General Purpose Audit Logging RPC with Multi-Tenancy
create or replace function public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_reason text default null,
  p_details text default null,
  p_salon_id text default 'default'
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_log_id uuid;
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
  v_user_role text;
begin
  if v_user_id is not null then
    select email, full_name, role into v_user_email, v_user_name, v_user_role
      from public.profiles where id = v_user_id;
  end if;

  insert into public.audit_logs (
    salon_id,
    action,
    entity_type,
    entity_id,
    user_id,
    user_email,
    user_name,
    user_role,
    old_data,
    new_data,
    reason,
    details
  ) values (
    coalesce(p_salon_id, 'default'),
    p_action,
    p_entity_type,
    p_entity_id,
    v_user_id,
    v_user_email,
    v_user_name,
    v_user_role,
    p_old_data,
    p_new_data,
    p_reason,
    p_details
  ) returning id into v_log_id;

  return v_log_id;
end;
$$;

-- 8. Staff Management RPCs (Multi-Tenant & Multi-Salon)
create or replace function public.get_staff_users(
  p_salon_id text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb;
  v_is_super boolean := public.is_superadmin();
begin
  if not public.is_admin_or_owner() then
    raise exception 'Permission Denied: Only Admin or Owner can view staff users list.';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'email', coalesce(p.email, u.email, 'No Email'),
      'full_name', coalesce(p.full_name, split_part(coalesce(p.email, u.email, 'Staff'), '@', 1)),
      'role', p.role,
      'salon_id', coalesce(p.salon_id, 'default'),
      'assigned_salons', coalesce(p.assigned_salons, array[coalesce(p.salon_id, 'default')]::text[]),
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ) order by p.created_at desc
  ) into v_result
  from public.profiles p
  left join auth.users u on u.id = p.id
  where (v_is_super or p_salon_id is null or p.salon_id = p_salon_id or p_salon_id = any(p.assigned_salons));

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

create or replace function public.update_user_role(
  p_user_id uuid,
  p_new_role text,
  p_salon_id text default null,
  p_assigned_salons text[] default null
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_old_role text;
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
  v_user_role text;
begin
  if not public.is_admin_or_owner() then
    raise exception 'Permission Denied: Only Admin or Owner can update user roles.';
  end if;

  if p_new_role not in ('superadmin', 'owner', 'admin', 'staff') then
    raise exception 'Invalid role specified. Role must be superadmin, owner, admin or staff.';
  end if;

  select role into v_old_role from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User profile not found.';
  end if;

  update public.profiles
     set role = p_new_role,
         salon_id = coalesce(p_salon_id, salon_id),
         assigned_salons = coalesce(p_assigned_salons, assigned_salons),
         updated_at = now()
   where id = p_user_id;

  if v_user_id is not null then
    select email, full_name, role into v_user_email, v_user_name, v_user_role
      from public.profiles where id = v_user_id;
  end if;

  insert into public.audit_logs (
    salon_id,
    action,
    entity_type,
    entity_id,
    user_id,
    user_email,
    user_name,
    user_role,
    old_data,
    new_data,
    details
  ) values (
    coalesce(p_salon_id, 'default'),
    'USER_ROLE_CHANGE',
    'user',
    p_user_id::text,
    v_user_id,
    v_user_email,
    v_user_name,
    v_user_role,
    jsonb_build_object('role', v_old_role),
    jsonb_build_object('role', p_new_role, 'salon_id', p_salon_id),
    'Updated user role from ' || v_old_role || ' to ' || p_new_role
  );

  return true;
end;
$$;

-- Grant execution permissions to authenticated and anon roles
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated, anon;
grant all on all sequences in schema public to authenticated, anon;
grant execute on all functions in schema public to authenticated, anon;

