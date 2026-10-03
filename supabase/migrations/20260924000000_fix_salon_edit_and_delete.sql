-- =====================================================================
-- Migration: Fix Salon Branch Editing, Deletion & Foreign Key Cascading
-- =====================================================================

-- 1. Ensure RLS policies on public.salons allow select, insert, update, and delete
alter table public.salons enable row level security;

drop policy if exists "salons_select_accessible" on public.salons;
drop policy if exists "salons_admin_write" on public.salons;
drop policy if exists "salons_select_all" on public.salons;
drop policy if exists "salons_write_all" on public.salons;
drop policy if exists "salons_insert_all" on public.salons;
drop policy if exists "salons_update_all" on public.salons;
drop policy if exists "salons_delete_all" on public.salons;

create policy "salons_select_all" on public.salons
  for select to authenticated, anon
  using (true);

create policy "salons_insert_all" on public.salons
  for insert to authenticated, anon
  with check (true);

create policy "salons_update_all" on public.salons
  for update to authenticated, anon
  using (true)
  with check (true);

create policy "salons_delete_all" on public.salons
  for delete to authenticated, anon
  using (true);

-- 2. Atomic Stored Procedure: delete_salon_branch
-- Safely reassigns user profiles, cleans up dependent child data, and deletes the salon
create or replace function public.delete_salon_branch(
  p_salon_id text
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
  v_user_role text;
  v_salon record;
begin
  if p_salon_id is null or trim(p_salon_id) = '' or p_salon_id = 'default' then
    raise exception 'Cannot delete the primary/default salon branch.';
  end if;

  select * into v_salon from public.salons where id = p_salon_id;
  if not found then
    raise exception 'Salon branch with ID "%" does not exist.', p_salon_id;
  end if;

  -- Verify permissions if authenticated
  if v_user_id is not null then
    select email, full_name, role into v_user_email, v_user_name, v_user_role
      from public.profiles where id = v_user_id;

    if not public.is_admin_or_owner() then
      raise exception 'Permission Denied: Only Administrator or Owner can delete salon branches.';
    end if;
  end if;

  -- 1. Reassign user profiles belonging to this salon back to default
  update public.profiles
     set salon_id = 'default',
         assigned_salons = array_remove(coalesce(assigned_salons, array['default']::text[]), p_salon_id),
         updated_at = now()
   where salon_id = p_salon_id;

  update public.profiles
     set assigned_salons = array_remove(assigned_salons, p_salon_id),
         updated_at = now()
   where p_salon_id = any(assigned_salons);

  -- 2. Remove dependent records for this salon
  delete from public.whatsapp_messages where salon_id = p_salon_id;
  delete from public.offers where salon_id = p_salon_id;
  delete from public.invoices where salon_id = p_salon_id;
  delete from public.transactions where salon_id = p_salon_id;
  delete from public.wig_products where salon_id = p_salon_id;
  delete from public.services where salon_id = p_salon_id;
  delete from public.customers where salon_id = p_salon_id;

  -- 3. Delete the salon record itself
  delete from public.salons where id = p_salon_id;

  -- 4. Record audit event
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
    'default',
    'SALON_DELETE',
    'salon',
    p_salon_id,
    v_user_id,
    v_user_email,
    v_user_name,
    v_user_role,
    row_to_json(v_salon)::jsonb,
    'Permanently deleted Salon Branch: ' || coalesce(v_salon.name, p_salon_id)
  );

  return true;
end;
$$;

-- 3. Atomic Stored Procedure: save_salon_branch
-- Creates or updates salon branch details with audit trail
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
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
  v_user_role text;
  v_slug text;
  v_prefix text;
  v_is_new boolean;
  v_existing record;
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

  select * into v_existing from public.salons where id = p_id;
  v_is_new := not found;

  if v_user_id is not null then
    select email, full_name, role into v_user_email, v_user_name, v_user_role
      from public.profiles where id = v_user_id;

    if not public.is_admin_or_owner() then
      raise exception 'Permission Denied: Only Administrator or Owner can create or edit salon branches.';
    end if;
  end if;

  if v_is_new then
    insert into public.salons (
      id,
      name,
      slug,
      subtitle,
      invoice_prefix,
      mobile,
      email,
      address,
      whatsapp_number,
      owner_name,
      owner_email,
      status,
      created_at,
      updated_at
    ) values (
      p_id,
      trim(p_name),
      v_slug,
      trim(coalesce(p_subtitle, 'Hair Wig & Hair Services')),
      v_prefix,
      trim(coalesce(p_mobile, '+91 98765 43210')),
      trim(coalesce(p_email, 'sameershaikh121@proton.me')),
      trim(coalesce(p_address, 'Mumbai, Maharashtra')),
      trim(coalesce(p_whatsapp_number, '919876543210')),
      trim(coalesce(p_owner_name, 'Salon Owner')),
      trim(coalesce(p_owner_email, '')),
      coalesce(p_status, 'ACTIVE'),
      now(),
      now()
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
  end if;

  -- Record audit log
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
    p_id,
    case when v_is_new then 'SALON_CREATE' else 'SALON_UPDATE' end,
    'salon',
    p_id,
    v_user_id,
    v_user_email,
    v_user_name,
    v_user_role,
    case when v_is_new then null else row_to_json(v_existing)::jsonb end,
    jsonb_build_object('id', p_id, 'name', trim(p_name), 'prefix', v_prefix, 'slug', v_slug),
    (case when v_is_new then 'Created' else 'Updated' end) || ' Salon Branch: ' || trim(p_name) || ' (' || v_prefix || ')'
  );

  select row_to_json(s)::jsonb into v_result
    from public.salons s
   where s.id = p_id;

  return v_result;
end;
$$;

-- Grant execution permissions
grant execute on function public.delete_salon_branch(text) to authenticated, anon;
grant execute on function public.save_salon_branch(text, text, text, text, text, text, text, text, text, text, text, text) to authenticated, anon;
