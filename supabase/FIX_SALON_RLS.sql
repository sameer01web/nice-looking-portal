-- =====================================================================
-- QUICK FIX: Enable Salon Branch Update & Delete (Run in Supabase SQL Editor)
-- =====================================================================

alter table public.salons enable row level security;

drop policy if exists "salons_select_accessible" on public.salons;
drop policy if exists "salons_admin_write" on public.salons;
drop policy if exists "salons_select_all" on public.salons;
drop policy if exists "salons_write_all" on public.salons;
drop policy if exists "salons_insert_all" on public.salons;
drop policy if exists "salons_update_all" on public.salons;
drop policy if exists "salons_delete_all" on public.salons;

create policy "salons_select_all" on public.salons for select to authenticated, anon using (true);
create policy "salons_insert_all" on public.salons for insert to authenticated, anon with check (true);
create policy "salons_update_all" on public.salons for update to authenticated, anon using (true) with check (true);
create policy "salons_delete_all" on public.salons for delete to authenticated, anon using (true);

-- 2. Atomic Stored Procedure: delete_salon_branch (Security Definer)
create or replace function public.delete_salon_branch(
  p_salon_id text
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_salon record;
begin
  if p_salon_id is null or trim(p_salon_id) = '' or p_salon_id = 'default' then
    raise exception 'Cannot delete the primary/default salon branch.';
  end if;

  select * into v_salon from public.salons where id = p_salon_id;
  if not found then
    return true;
  end if;

  update public.profiles
     set salon_id = 'default',
         assigned_salons = array_remove(coalesce(assigned_salons, array['default']::text[]), p_salon_id),
         updated_at = now()
   where salon_id = p_salon_id;

  update public.profiles
     set assigned_salons = array_remove(assigned_salons, p_salon_id),
         updated_at = now()
   where p_salon_id = any(assigned_salons);

  delete from public.whatsapp_messages where salon_id = p_salon_id;
  delete from public.offers where salon_id = p_salon_id;
  delete from public.invoices where salon_id = p_salon_id;
  delete from public.transactions where salon_id = p_salon_id;
  delete from public.wig_products where salon_id = p_salon_id;
  delete from public.services where salon_id = p_salon_id;
  delete from public.customers where salon_id = p_salon_id;
  delete from public.salons where id = p_salon_id;

  return true;
end;
$$;

-- 3. Atomic Stored Procedure: save_salon_branch (Security Definer)
create or replace function public.save_salon_branch(
  p_id text,
  p_name text,
  p_slug text default null,
  p_subtitle text default null,
  p_invoice_prefix text default 'NL',
  p_mobile text default null,
  p_email text default null,
  p_address text default null,
  p_whatsapp_number text default null,
  p_owner_name text default null,
  p_owner_email text default null,
  p_status text default 'ACTIVE'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_slug text;
  v_prefix text;
  v_is_new boolean;
  v_result jsonb;
begin
  if p_name is null or trim(p_name) = '' then
    raise exception 'Salon business name is required.';
  end if;

  v_prefix := upper(trim(coalesce(p_invoice_prefix, 'NL')));
  if v_prefix = '' then
    v_prefix := 'NL';
  end if;

  v_slug := lower(trim(coalesce(p_slug, regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'))));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    v_slug := 'salon-' || floor(random() * 10000)::text;
  end if;

  select exists(select 1 from public.salons where id = p_id) into v_is_new;
  v_is_new := not v_is_new;

  if v_is_new then
    insert into public.salons (
      id, name, slug, subtitle, invoice_prefix, mobile, email, address, whatsapp_number, owner_name, owner_email, status, created_at, updated_at
    ) values (
      p_id, trim(p_name), v_slug, trim(coalesce(p_subtitle, 'Hair Wig & Hair Services')), v_prefix,
      trim(coalesce(p_mobile, '+91 98765 43210')), trim(coalesce(p_email, 'sameershaikh121@proton.me')),
      trim(coalesce(p_address, 'Mumbai, Maharashtra')), trim(coalesce(p_whatsapp_number, '919876543210')),
      trim(coalesce(p_owner_name, 'Salon Owner')), trim(coalesce(p_owner_email, '')), coalesce(p_status, 'ACTIVE'), now(), now()
    );
  else
    update public.salons
       set name = trim(p_name),
           slug = coalesce(v_slug, slug),
           subtitle = trim(coalesce(p_subtitle, subtitle)),
           invoice_prefix = v_prefix,
           mobile = trim(coalesce(p_mobile, mobile)),
           email = trim(coalesce(p_email, email)),
           address = trim(coalesce(p_address, address)),
           whatsapp_number = trim(coalesce(p_whatsapp_number, whatsapp_number)),
           owner_name = trim(coalesce(p_owner_name, owner_name)),
           owner_email = trim(coalesce(p_owner_email, owner_email)),
           status = coalesce(p_status, status),
           updated_at = now()
     where id = p_id;
  -- Automatically link this salon branch to owner profile if owner exists
  if p_owner_email is not null and trim(p_owner_email) != '' then
    update public.profiles
       set assigned_salons = array_append(array_remove(coalesce(assigned_salons, array[]::text[]), p_id), p_id),
           role = case when role = 'staff' then 'owner' else role end,
           updated_at = now()
     where lower(trim(email)) = lower(trim(p_owner_email));
  end if;

  select row_to_json(s)::jsonb into v_result
    from public.salons s
   where s.id = p_id;

  return v_result;
end;
$$;

-- 4. Grant table and execution permissions
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated, anon;
grant all on all sequences in schema public to authenticated, anon;
grant execute on function public.delete_salon_branch(text) to authenticated, anon;
grant execute on function public.save_salon_branch(text, text, text, text, text, text, text, text, text, text, text, text) to authenticated, anon;
