-- =====================================================================
-- NICE LOOKING Hair Wig & Services Management Portal - Supabase Schema
-- Includes Role-Based Access Control (RBAC), Audit Logging & Void Control
-- Run this entire script in your Supabase SQL Editor.
-- =====================================================================

-- 1. Enable required extensions
create extension if not exists "pgcrypto";

-- 2. Profiles table (linked to Supabase Auth users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'owner', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helper functions for RBAC verification
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

create or replace function public.is_admin_or_owner()
returns boolean
language sql
stable
security definer
as $$
  select coalesce(
    (select role in ('admin', 'owner') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Trigger to automatically create a profile when a new user registers in Supabase Auth
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_owner_count integer;
  v_role text := 'staff';
  v_name text;
begin
  -- Check if any owner/admin already exists in profiles
  select count(*) into v_owner_count from public.profiles where role in ('owner', 'admin');
  -- First user in the database automatically becomes the owner/admin
  if v_owner_count = 0 then
    v_role := 'owner';
  else
    v_role := 'staff';
  end if;

  v_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, v_name, v_role)
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

-- 3. Customers table (Mobile is normalized and unique)
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mobile text not null,
  address text,
  whatsapp_opt_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_mobile_unique unique (mobile)
);

create index if not exists idx_customers_mobile on public.customers (mobile);
create index if not exists idx_customers_name on public.customers (name);

-- 4. Services lookup table
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 5. Wig Products table (Supports exact sizes e.g. 5x7, 5x8, 6x8)
create table if not exists public.wig_products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  name text, -- alias compatibility
  hair_type text not null default 'Human Hair',
  color text not null default 'Natural Black',
  size text not null default '5x7',
  price numeric(12,2) not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wig_products_active on public.wig_products (active);
create index if not exists idx_wig_products_name on public.wig_products (product_name);

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

-- 6. Transactions table
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
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

create index if not exists idx_transactions_customer on public.transactions (customer_id);
create index if not exists idx_transactions_service_date on public.transactions (service_date);

-- 7. Invoices table
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
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
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoices_customer on public.invoices (customer_id);
create index if not exists idx_invoices_date on public.invoices (invoice_date);
create index if not exists idx_invoices_number on public.invoices (invoice_number);
create index if not exists idx_invoices_is_voided on public.invoices (is_voided);

-- Safe migration statements for existing databases (adds columns if they do not exist)
alter table public.invoices add column if not exists status text not null default 'PAID';
alter table public.invoices add column if not exists is_voided boolean not null default false;
alter table public.invoices add column if not exists voided_at timestamptz;
alter table public.invoices add column if not exists voided_by uuid references auth.users(id) on delete set null;
alter table public.invoices add column if not exists void_reason text;
alter table public.invoices add column if not exists voided_by_name text;
alter table public.invoices add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.invoices add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.transactions add column if not exists is_voided boolean not null default false;
alter table public.transactions add column if not exists created_by uuid references auth.users(id) on delete set null;

-- 8. Audit Logs table (Immutable audit trail for financial & operational actions)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null, -- 'INVOICE_CREATE', 'INVOICE_EDIT', 'INVOICE_VOID', 'CUSTOMER_CREATE', 'CUSTOMER_UPDATE', 'CUSTOMER_DELETE', 'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_DELETE', 'STOCK_CHANGE', 'SETTINGS_UPDATE', 'USER_ROLE_CHANGE', 'USER_LOGIN'
  entity_type text not null, -- 'invoice', 'customer', 'wig_product', 'settings', 'user', 'auth'
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

create index if not exists idx_audit_logs_action on public.audit_logs (action);
create index if not exists idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);
create index if not exists idx_audit_logs_user on public.audit_logs (user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);

-- 9. Settings table
create table if not exists public.settings (
  id text primary key default 'default',
  shop_name text not null default 'NICE LOOKING',
  shop_subtitle text not null default 'Hair Wig & Hair Services',
  shop_mobile text default '+91 98765 43210',
  shop_address text default 'Mumbai, Maharashtra',
  invoice_prefix text not null default 'NL',
  whatsapp_number text default '919876543210',
  updated_at timestamptz not null default now()
);

-- Insert default settings row if missing
insert into public.settings (id, shop_name, shop_subtitle, shop_mobile, shop_address, invoice_prefix, whatsapp_number)
values ('default', 'NICE LOOKING', 'Hair Wig & Hair Services', '+91 98765 43210', 'Mumbai, Maharashtra', 'NL', '919876543210')
on conflict (id) do nothing;

-- 10. Offers table
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  discount numeric(5,2),
  valid_until date,
  status text not null default 'ACTIVE' check (status in ('DRAFT', 'ACTIVE', 'EXPIRED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 11. WhatsApp message logs table
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
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

-- Seed services catalog
insert into public.services (name) values
  ('Hair Wig'),
  ('Wig Service'),
  ('Hair Color'),
  ('Hair Treatment'),
  ('Hair Consultation'),
  ('Other')
on conflict (name) do nothing;

-- Seed demo wig products if empty
insert into public.wig_products (product_name, hair_type, color, size, price, stock, active)
values
  ('Premium Natural Wig', 'Human Hair', 'Natural Black', '5x7', 12000, 5, true),
  ('Classic Hair Wig', 'Synthetic', 'Natural Black', '5x8', 6500, 8, true),
  ('Premium Brown Wig', 'Human Hair', 'Brown', '6x8', 14500, 3, true),
  ('Silk Base Wig', 'Human Hair', 'Dark Brown', '7x9', 18000, 4, true)
on conflict do nothing;

-- =====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES (DATABASE-LEVEL RBAC ENFORCEMENT)
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.services enable row level security;
alter table public.wig_products enable row level security;
alter table public.transactions enable row level security;
alter table public.invoices enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings enable row level security;
alter table public.offers enable row level security;
alter table public.whatsapp_messages enable row level security;

-- Drop previous policies to avoid duplicates
drop policy if exists "auth_profiles_all" on public.profiles;
drop policy if exists "profiles_select_auth" on public.profiles;
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;

drop policy if exists "auth_customers_all" on public.customers;
drop policy if exists "anon_customers_all" on public.customers;
drop policy if exists "customers_select_all" on public.customers;
drop policy if exists "customers_insert_auth" on public.customers;
drop policy if exists "customers_update_auth" on public.customers;
drop policy if exists "customers_delete_admin" on public.customers;

drop policy if exists "auth_services_all" on public.services;
drop policy if exists "anon_services_all" on public.services;
drop policy if exists "services_select_all" on public.services;
drop policy if exists "services_admin_write" on public.services;

drop policy if exists "auth_wig_products_all" on public.wig_products;
drop policy if exists "anon_wig_products_all" on public.wig_products;
drop policy if exists "wig_products_select_all" on public.wig_products;
drop policy if exists "wig_products_admin_write" on public.wig_products;

drop policy if exists "auth_transactions_all" on public.transactions;
drop policy if exists "anon_transactions_all" on public.transactions;
drop policy if exists "transactions_select_auth" on public.transactions;
drop policy if exists "transactions_insert_auth" on public.transactions;
drop policy if exists "transactions_admin_write" on public.transactions;
drop policy if exists "transactions_admin_delete" on public.transactions;

drop policy if exists "auth_invoices_all" on public.invoices;
drop policy if exists "anon_invoices_all" on public.invoices;
drop policy if exists "invoices_select_auth" on public.invoices;
drop policy if exists "invoices_insert_auth" on public.invoices;
drop policy if exists "invoices_update_admin" on public.invoices;
drop policy if exists "invoices_delete_admin" on public.invoices;

drop policy if exists "audit_logs_select_admin" on public.audit_logs;
drop policy if exists "audit_logs_insert_auth" on public.audit_logs;
drop policy if exists "audit_logs_all" on public.audit_logs;

drop policy if exists "auth_settings_all" on public.settings;
drop policy if exists "anon_settings_all" on public.settings;
drop policy if exists "settings_select_all" on public.settings;
drop policy if exists "settings_admin_write" on public.settings;

drop policy if exists "auth_offers_all" on public.offers;
drop policy if exists "anon_offers_all" on public.offers;
drop policy if exists "offers_select_all" on public.offers;
drop policy if exists "offers_admin_write" on public.offers;

drop policy if exists "auth_whatsapp_messages_all" on public.whatsapp_messages;
drop policy if exists "anon_whatsapp_messages_all" on public.whatsapp_messages;
drop policy if exists "whatsapp_messages_select_auth" on public.whatsapp_messages;
drop policy if exists "whatsapp_messages_insert_auth" on public.whatsapp_messages;

-- 1. Profiles Policies
create policy "profiles_select_auth" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin_or_owner())
  with check (
    -- Non-admin cannot escalate their own role
    (public.is_admin_or_owner()) or
    (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()))
  );

create policy "profiles_admin_all" on public.profiles
  for all to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- 2. Customers Policies (Staff can create and edit contact info, but CANNOT delete)
create policy "customers_select_all" on public.customers
  for select to authenticated, anon using (true);

create policy "customers_insert_auth" on public.customers
  for insert to authenticated, anon with check (true);

create policy "customers_update_auth" on public.customers
  for update to authenticated, anon using (true) with check (true);

create policy "customers_delete_admin" on public.customers
  for delete to authenticated
  using (public.is_admin_or_owner());

-- 3. Services Policies
create policy "services_select_all" on public.services
  for select to authenticated, anon using (true);

create policy "services_admin_write" on public.services
  for all to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- 4. Wig Products Policies (Staff can VIEW stock; cannot directly INSERT/UPDATE/DELETE products)
create policy "wig_products_select_all" on public.wig_products
  for select to authenticated, anon using (true);

create policy "wig_products_admin_write" on public.wig_products
  for all to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- 5. Transactions Policies
create policy "transactions_select_auth" on public.transactions
  for select to authenticated, anon using (true);

create policy "transactions_insert_auth" on public.transactions
  for insert to authenticated, anon with check (true);

create policy "transactions_admin_write" on public.transactions
  for update to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

create policy "transactions_admin_delete" on public.transactions
  for delete to authenticated
  using (public.is_admin_or_owner());

-- 6. Invoices Policies (Staff can VIEW and CREATE; Staff CANNOT directly UPDATE or DELETE)
create policy "invoices_select_auth" on public.invoices
  for select to authenticated, anon using (true);

create policy "invoices_insert_auth" on public.invoices
  for insert to authenticated, anon with check (true);

create policy "invoices_update_admin" on public.invoices
  for update to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

create policy "invoices_delete_admin" on public.invoices
  for delete to authenticated
  using (public.is_admin_or_owner());

-- 7. Audit Logs Policies (Owner/Admin only for SELECT; authenticated can insert; NO updates or deletes allowed)
create policy "audit_logs_select_admin" on public.audit_logs
  for select to authenticated
  using (public.is_admin_or_owner());

create policy "audit_logs_insert_auth" on public.audit_logs
  for insert to authenticated, anon
  with check (true);

-- 8. Settings Policies (Owner/Admin only for edits)
create policy "settings_select_all" on public.settings
  for select to authenticated, anon using (true);

create policy "settings_admin_write" on public.settings
  for all to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- 9. Offers Policies (Owner/Admin only for edits)
create policy "offers_select_all" on public.offers
  for select to authenticated, anon using (true);

create policy "offers_admin_write" on public.offers
  for all to authenticated
  using (public.is_admin_or_owner())
  with check (public.is_admin_or_owner());

-- 10. WhatsApp Messages Policies
create policy "whatsapp_messages_select_auth" on public.whatsapp_messages
  for select to authenticated, anon using (true);

create policy "whatsapp_messages_insert_auth" on public.whatsapp_messages
  for insert to authenticated, anon with check (true);

-- =====================================================================
-- ATOMIC STORED PROCEDURES & RPC FUNCTIONS (SECURITY DEFINER)
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
  p_invoice_date timestamptz default now()
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_customer_id uuid;
  v_transaction_id uuid;
  v_invoice_id uuid;
  v_product record;
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

  -- Lookup acting user profile
  if v_user_id is not null then
    select email, full_name, role into v_user_email, v_user_name, v_user_role
      from public.profiles where id = v_user_id;
  end if;

  -- 1. Find or create customer atomically
  select id into v_customer_id
    from public.customers
   where mobile = v_norm_mobile
   limit 1;

  if v_customer_id is not null then
    update public.customers
       set name = trim(p_customer_name),
           address = coalesce(trim(p_customer_address), address),
           updated_at = now()
     where id = v_customer_id;
  else
    insert into public.customers (name, mobile, address, whatsapp_opt_in)
    values (trim(p_customer_name), v_norm_mobile, trim(p_customer_address), true)
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
    v_final_invoice_number := 'NL-' || to_char(coalesce(p_invoice_date, now()), 'YYYY') || '-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0');
  end if;

  -- 4. Create Transaction record
  insert into public.transactions (
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
      'payment_mode', p_payment_mode
    ),
    'Created Invoice #' || v_final_invoice_number || ' for ₹' || v_total::text
  );

  -- 7. Return comprehensive JSON object
  select jsonb_build_object(
    'id', v_invoice_id,
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
  p_reason text
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

  -- 1. Restore Wig Inventory Stock exactly once
  -- A. Check if invoice has itemized JSON payload in description
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

  -- B. Fallback to standard product_id column if not restored via JSON array
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

  -- 2. Mark Invoice as VOIDED (preserve original records)
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
      'product_id', v_inv.product_id,
      'quantity', v_inv.quantity,
      'created_at', v_inv.created_at
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

-- 5. Atomic Update Invoice with Stock Rebalancing & Owner Audit Diff (Owner/Admin Only)
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
  p_invoice_date timestamptz default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_old_inv record;
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
  -- RBAC Check: Only Admin or Owner can edit invoices
  if v_user_id is not null and not public.is_admin_or_owner() then
    raise exception 'Permission Denied: Only an Owner or Administrator can edit invoice details.';
  end if;

  -- Fetch current invoice locked
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

  v_norm_mobile := regexp_replace(coalesce(p_customer_mobile, ''), '\D', '', 'g');
  if length(v_norm_mobile) < 10 then
    raise exception 'Valid contact number is required.';
  end if;

  -- Lookup acting user profile
  if v_user_id is not null then
    select email, full_name, role into v_user_email, v_user_name, v_user_role
      from public.profiles where id = v_user_id;
  end if;

  -- 1. Reconcile customer
  select id into v_customer_id
    from public.customers
   where mobile = v_norm_mobile
   limit 1;

  if v_customer_id is not null then
    update public.customers
       set name = trim(p_customer_name),
           address = coalesce(trim(p_customer_address), address),
           updated_at = now()
     where id = v_customer_id;
  else
    insert into public.customers (name, mobile, address)
    values (trim(p_customer_name), v_norm_mobile, trim(p_customer_address))
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
      -- Same product: check difference
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
      -- Product changed: restore old product stock, deduct new product stock
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
    -- Changed from Hair Wig to Non-wig service: restore old stock if any
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

  -- 5. Record Immutable Audit Log with Old vs New Diff
  insert into public.audit_logs (
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
      'product_id', v_old_inv.product_id,
      'product_name', v_old_inv.product_name,
      'quantity', v_old_inv.quantity,
      'subtotal', v_old_inv.subtotal,
      'discount', v_old_inv.discount,
      'total', v_old_inv.total,
      'payment_mode', v_old_inv.payment_mode
    ),
    jsonb_build_object(
      'customer_id', v_customer_id,
      'service_type', p_service_type,
      'product_id', case when p_service_type = 'Hair Wig' then p_product_id else null end,
      'quantity', v_new_qty,
      'subtotal', p_subtotal,
      'discount', p_discount,
      'total', p_total,
      'payment_mode', p_payment_mode
    ),
    'Updated Invoice #' || v_old_inv.invoice_number || ' (Total: ₹' || p_total::text || ')'
  );

  -- Return updated snapshot
  select jsonb_build_object(
    'id', p_invoice_id,
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
  -- RBAC Check: Only Admin or Owner can delete invoices
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

  -- Lookup acting user profile
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
      'is_voided', v_inv.is_voided
    ),
    'Permanently deleted Invoice #' || v_inv.invoice_number
  );

  -- 3. Delete invoice record
  delete from public.invoices where id = p_invoice_id;

  -- 4. Delete linked transaction if present
  if v_inv.transaction_id is not null then
    delete from public.transactions where id = v_inv.transaction_id;
  end if;

  return true;
end;
$$;

-- 7. General Purpose Audit Logging RPC
create or replace function public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_reason text default null,
  p_details text default null
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

-- 8. Staff Management RPCs (Owner/Admin Only)
create or replace function public.get_staff_users()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb;
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
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ) order by p.created_at desc
  ) into v_result
  from public.profiles p
  left join auth.users u on u.id = p.id;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

create or replace function public.update_user_role(
  p_user_id uuid,
  p_new_role text
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

  if p_new_role not in ('owner', 'admin', 'staff') then
    raise exception 'Invalid role specified. Role must be owner, admin or staff.';
  end if;

  select role into v_old_role from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User profile not found.';
  end if;

  -- Prevent removing the last owner or admin
  if v_old_role in ('admin', 'owner') and p_new_role = 'staff' then
    if (select count(*) from public.profiles where role in ('admin', 'owner')) <= 1 then
      raise exception 'Cannot demote the last Owner / Administrator account in the portal.';
    end if;
  end if;

  update public.profiles
     set role = p_new_role,
         updated_at = now()
   where id = p_user_id;

  -- Audit log for role change
  if v_user_id is not null then
    select email, full_name, role into v_user_email, v_user_name, v_user_role
      from public.profiles where id = v_user_id;
  end if;

  insert into public.audit_logs (
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
    'USER_ROLE_CHANGE',
    'user',
    p_user_id::text,
    v_user_id,
    v_user_email,
    v_user_name,
    v_user_role,
    jsonb_build_object('role', v_old_role),
    jsonb_build_object('role', p_new_role),
    'Updated user role from ' || v_old_role || ' to ' || p_new_role
  );

  return true;
end;
$$;

-- Grant execution permissions
grant execute on function public.current_user_role to authenticated, anon;
grant execute on function public.is_admin_or_owner to authenticated, anon;
grant execute on function public.decrement_product_stock to authenticated, anon;
grant execute on function public.restore_product_stock to authenticated, anon;
grant execute on function public.create_invoice_with_stock to authenticated, anon;
grant execute on function public.void_invoice to authenticated, anon;
grant execute on function public.update_invoice_with_stock to authenticated, anon;
grant execute on function public.delete_invoice_with_stock to authenticated, anon;
grant execute on function public.log_audit_event to authenticated, anon;
grant execute on function public.get_staff_users to authenticated, anon;
grant execute on function public.update_user_role to authenticated, anon;
