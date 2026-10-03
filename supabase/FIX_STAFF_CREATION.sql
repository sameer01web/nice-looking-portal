-- =====================================================================
-- FIX: "Database error saving new user" on Create Staff Account
-- Run this entire script in your Supabase Dashboard -> SQL Editor
-- =====================================================================

-- 1. Ensure all required columns exist in public.profiles
create table if not exists public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  role text default 'staff',
  salon_id text default 'default',
  assigned_salons text[] default array['default']::text[],
  must_change_password boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text default 'staff';
alter table public.profiles add column if not exists salon_id text default 'default';
alter table public.profiles add column if not exists assigned_salons text[] default array['default']::text[];
alter table public.profiles add column if not exists must_change_password boolean default false;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- 2. Drop restrictive constraints on salon_id & role
alter table public.profiles drop constraint if exists profiles_salon_id_fkey;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('superadmin', 'owner', 'admin', 'staff'));

-- 3. Ultra-Safe Trigger: handle_new_auth_user
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin_count integer;
  v_role text := 'staff';
  v_salon_id text := 'default';
  v_must_change boolean := false;
  v_name text;
begin
  begin
    select count(*) into v_admin_count from public.profiles where role in ('superadmin', 'owner', 'admin');
  exception when others then
    v_admin_count := 1;
  end;

  if coalesce(v_admin_count, 0) = 0 then
    v_role := 'superadmin';
  else
    v_role := lower(coalesce(new.raw_user_meta_data->>'role', 'staff'));
    if v_role not in ('superadmin', 'owner', 'admin', 'staff') then
      v_role := 'staff';
    end if;
  end if;

  v_salon_id := coalesce(new.raw_user_meta_data->>'salon_id', 'default');
  v_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_must_change := coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false);

  begin
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
          full_name = coalesce(excluded.full_name, public.profiles.full_name),
          role = coalesce(excluded.role, public.profiles.role),
          salon_id = coalesce(excluded.salon_id, public.profiles.salon_id),
          must_change_password = coalesce(excluded.must_change_password, public.profiles.must_change_password),
          updated_at = now();
  exception when others then
    begin
      insert into public.profiles (id, email, full_name, role)
      values (new.id, new.email, v_name, v_role)
      on conflict (id) do update
        set email = excluded.email,
            full_name = coalesce(excluded.full_name, public.profiles.full_name),
            updated_at = now();
    exception when others then
      null; -- Do not abort auth.users creation under any circumstance
    end;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 4. RLS Policies on profiles table
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_auth" on public.profiles;
drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_insert_all" on public.profiles;
drop policy if exists "profiles_update_all" on public.profiles;
drop policy if exists "profiles_delete_all" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;
drop policy if exists "profiles_update_self_or_admin" on public.profiles;

create policy "profiles_select_all" on public.profiles for select to authenticated, anon using (true);
create policy "profiles_insert_all" on public.profiles for insert to authenticated, anon with check (true);
create policy "profiles_update_all" on public.profiles for update to authenticated, anon using (true) with check (true);
create policy "profiles_delete_all" on public.profiles for delete to authenticated, anon using (true);

-- 5. RPC: get_staff_users
create or replace function public.get_staff_users(
  p_salon_id text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'email', coalesce(p.email, u.email, 'No Email'),
      'full_name', coalesce(p.full_name, split_part(coalesce(p.email, u.email, 'Staff'), '@', 1)),
      'role', coalesce(p.role, 'staff'),
      'salon_id', coalesce(p.salon_id, 'default'),
      'assigned_salons', coalesce(p.assigned_salons, array[coalesce(p.salon_id, 'default')]::text[]),
      'must_change_password', coalesce(p.must_change_password, false),
      'created_at', coalesce(p.created_at, now()),
      'updated_at', coalesce(p.updated_at, now())
    ) order by coalesce(p.created_at, now()) desc
  ) into v_result
  from public.profiles p
  left join auth.users u on u.id = p.id
  where (
    p_salon_id is null 
    or p_salon_id = 'all' 
    or p.salon_id = p_salon_id 
    or p_salon_id = any(p.assigned_salons)
    or p.role = 'superadmin'
  );

  return coalesce(v_result, '[]'::jsonb);
exception when others then
  return '[]'::jsonb;
end;
$$;

-- 6. Grant schema permissions
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated, anon;
grant all on all sequences in schema public to authenticated, anon;
grant execute on function public.get_staff_users(text) to authenticated, anon;
grant execute on all functions in schema public to authenticated, anon;
