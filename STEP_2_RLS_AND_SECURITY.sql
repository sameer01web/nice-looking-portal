-- =====================================================================
-- STEP 2: ENABLE ROW LEVEL SECURITY (RLS) & TENANT ACCESS POLICIES
-- =====================================================================

-- 1. Enable Row Level Security (RLS)
alter table public.salon_payroll_settings enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.payrolls enable row level security;
alter table public.payroll_items enable row level security;
alter table public.salary_payments enable row level security;

-- 2. Row Level Security Policies (Multi-Tenant Scoping)
drop policy if exists "salon_payroll_settings_access" on public.salon_payroll_settings;
create policy "salon_payroll_settings_access" on public.salon_payroll_settings
  for all using (
    public.is_superadmin() or public.user_can_access_salon(salon_id)
  )
  with check (
    public.is_superadmin() or (public.user_can_access_salon(salon_id) and public.is_admin_or_owner())
  );

drop policy if exists "employees_select" on public.employees;
create policy "employees_select" on public.employees
  for select using (
    public.is_superadmin() or public.user_can_access_salon(salon_id)
  );

drop policy if exists "employees_manage" on public.employees;
create policy "employees_manage" on public.employees
  for all using (
    public.is_superadmin() or (public.user_can_access_salon(salon_id) and public.is_admin_or_owner())
  )
  with check (
    public.is_superadmin() or (public.user_can_access_salon(salon_id) and public.is_admin_or_owner())
  );

drop policy if exists "attendance_select" on public.attendance;
create policy "attendance_select" on public.attendance
  for select using (
    public.is_superadmin() or public.user_can_access_salon(salon_id)
  );

drop policy if exists "attendance_manage" on public.attendance;
create policy "attendance_manage" on public.attendance
  for all using (
    public.is_superadmin() or public.user_can_access_salon(salon_id)
  )
  with check (
    public.is_superadmin() or public.user_can_access_salon(salon_id)
  );

drop policy if exists "payrolls_admin_access" on public.payrolls;
create policy "payrolls_admin_access" on public.payrolls
  for all using (
    public.is_superadmin() or (public.user_can_access_salon(salon_id) and public.is_admin_or_owner())
  )
  with check (
    public.is_superadmin() or (public.user_can_access_salon(salon_id) and public.is_admin_or_owner())
  );

drop policy if exists "payroll_items_admin_access" on public.payroll_items;
create policy "payroll_items_admin_access" on public.payroll_items
  for all using (
    public.is_superadmin() or (public.user_can_access_salon(salon_id) and public.is_admin_or_owner())
  )
  with check (
    public.is_superadmin() or (public.user_can_access_salon(salon_id) and public.is_admin_or_owner())
  );

drop policy if exists "salary_payments_admin_access" on public.salary_payments;
create policy "salary_payments_admin_access" on public.salary_payments
  for all using (
    public.is_superadmin() or (public.user_can_access_salon(salon_id) and public.is_admin_or_owner())
  )
  with check (
    public.is_superadmin() or (public.user_can_access_salon(salon_id) and public.is_admin_or_owner())
  );

-- 3. Safe default seed
insert into public.salon_payroll_settings (salon_id, opening_time, closing_time, grace_period_minutes, salary_divisor_mode, weekly_off_paid, holiday_paid)
values
  ('default', '10:00:00', '20:00:00', 15, 'CALENDAR_DAYS', true, true),
  ('salon-andheri', '10:00:00', '20:30:00', 15, 'CALENDAR_DAYS', true, true),
  ('salon-south-mumbai', '09:30:00', '20:00:00', 15, 'CALENDAR_DAYS', true, true)
on conflict (salon_id) do nothing;

-- 4. Grant schema permissions
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated, anon;
grant all on all sequences in schema public to authenticated, anon;
grant execute on all functions in schema public to authenticated, anon;

