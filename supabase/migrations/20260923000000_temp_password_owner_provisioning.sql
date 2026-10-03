-- =============================================================
-- Migration: Temporary Password Flag & Owner Provisioning
-- =============================================================

-- 1. Add must_change_password column to profiles table
alter table public.profiles add column if not exists must_change_password boolean default false;

-- 2. Update get_staff_users RPC to include must_change_password
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
      'must_change_password', coalesce(p.must_change_password, false),
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

-- 3. Update handle_new_auth_user trigger to preserve must_change_password from user metadata
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_admin_count integer;
  v_role text := 'staff';
  v_salon_id text := 'default';
  v_must_change boolean := false;
  v_name text;
begin
  select count(*) into v_admin_count from public.profiles where role in ('superadmin', 'owner', 'admin');

  if v_admin_count = 0 then
    v_role := 'superadmin';
  else
    v_role := coalesce(new.raw_user_meta_data->>'role', 'staff');
  end if;

  v_salon_id := coalesce(new.raw_user_meta_data->>'salon_id', 'default');
  v_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_must_change := coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false);

  insert into public.profiles (id, email, full_name, role, salon_id, assigned_salons, must_change_password)
  values (
    new.id,
    new.email,
    v_name,
    v_role,
    v_salon_id,
    case when v_role = 'superadmin' then array['default', 'salon-andheri', 'salon-south-mumbai']::text[] else array[v_salon_id]::text[] end,
    v_must_change
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = coalesce(public.profiles.role, excluded.role),
        salon_id = coalesce(public.profiles.salon_id, excluded.salon_id),
        must_change_password = coalesce(excluded.must_change_password, public.profiles.must_change_password),
        updated_at = now();

  return new;
end;
$$;
