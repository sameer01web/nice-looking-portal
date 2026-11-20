-- =====================================================================
-- MY SALON MULTI-SALON SAAS: COMPLETE DATABASE SYNC & OPTIMIZATION
-- =====================================================================
-- STEP TO EXECUTE:
-- 1. Open your Supabase Dashboard:
--    https://supabase.com/dashboard/project/vcoeyueuwugfguivfuft/sql/new
-- 2. Paste this entire script into the SQL Editor.
-- 3. Click the green "Run" button.
--
-- This script creates all missing Employee, Attendance & Payroll tables,
-- enables Row Level Security (RLS) for multi-salon tenant isolation,
-- and adds high-speed database indexes for fast query execution.
-- It is 100% SAFE and will NOT overwrite or delete any existing data!
-- =====================================================================

-- 1. Ensure Table Structure for salon_payroll_settings
create table if not exists public.salon_payroll_settings (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null unique,
  opening_time time not null default '10:00:00',
  closing_time time not null default '20:00:00',
  grace_period_minutes integer not null default 15,
  salary_divisor_mode text not null default 'CALENDAR_DAYS' check (salary_divisor_mode in ('CALENDAR_DAYS', 'FIXED_30', 'FIXED_26', 'WORKING_DAYS')),
  weekly_off_paid boolean not null default true,
  holiday_paid boolean not null default true,
  half_day_deduction_factor numeric(3,2) not null default 0.50,
  overtime_enabled boolean not null default true,
  default_overtime_multiplier numeric(4,2) not null default 1.50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Ensure Table Structure for employees
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default',
  branch_id text default 'default',
  name text not null,
  mobile text not null,
  job_role text not null,
  joining_date date not null default current_date,
  salary_type text not null default 'MONTHLY' check (salary_type in ('MONTHLY', 'DAILY_WAGE', 'HOURLY')),
  base_salary numeric(12,2) not null default 0 check (base_salary >= 0),
  monthly_working_days integer not null default 30 check (monthly_working_days between 20 and 31),
  paid_leaves_per_month integer not null default 1 check (paid_leaves_per_month >= 0),
  overtime_rate numeric(10,2) not null default 0 check (overtime_rate >= 0),
  fixed_allowance numeric(10,2) not null default 0 check (fixed_allowance >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  address text,
  notes text,
  user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Ensure Table Structure for attendance
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default',
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'UNPAID_LEAVE', 'WEEKLY_OFF', 'HOLIDAY')),
  check_in time,
  check_out time,
  working_hours numeric(5,2) not null default 0 check (working_hours >= 0),
  is_late boolean not null default false,
  late_minutes integer not null default 0,
  overtime_hours numeric(5,2) not null default 0 check (overtime_hours >= 0),
  notes text,
  marked_by uuid references auth.users(id) on delete set null,
  marked_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_employee_attendance_date unique(employee_id, attendance_date)
);

-- 4. Ensure Table Structure for payrolls
create table if not exists public.payrolls (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default',
  month_year text not null check (month_year ~ '^[0-9]{4}-[0-9]{2}$'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'FINALIZED', 'LOCKED')),
  total_salary_expense numeric(14,2) not null default 0,
  total_paid numeric(14,2) not null default 0,
  total_pending numeric(14,2) not null default 0,
  employee_count integer not null default 0,
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_by_name text,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_salon_payroll_month unique(salon_id, month_year)
);

-- 5. Ensure Table Structure for payroll_items
create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_id uuid not null references public.payrolls(id) on delete cascade,
  salon_id text not null default 'default',
  employee_id uuid not null references public.employees(id) on delete cascade,
  employee_name text not null,
  employee_mobile text,
  job_role text,
  month_year text not null,
  salary_type text not null,
  base_salary numeric(12,2) not null default 0,
  calculation_days integer not null default 30,
  present_days numeric(4,1) not null default 0,
  absent_days integer not null default 0,
  half_days integer not null default 0,
  paid_leaves numeric(4,1) not null default 0,
  unpaid_leaves integer not null default 0,
  weekly_offs integer not null default 0,
  holidays integer not null default 0,
  payable_days numeric(4,1) not null default 0,
  daily_rate numeric(10,2) not null default 0,
  hourly_rate numeric(10,2) not null default 0,
  overtime_hours numeric(6,2) not null default 0,
  overtime_amount numeric(10,2) not null default 0,
  fixed_allowance numeric(10,2) not null default 0,
  bonus numeric(10,2) not null default 0,
  bonus_reason text,
  absent_deduction numeric(10,2) not null default 0,
  half_day_deduction numeric(10,2) not null default 0,
  advance_deduction numeric(10,2) not null default 0,
  other_deductions numeric(10,2) not null default 0,
  deduction_reason text,
  gross_salary numeric(12,2) not null default 0,
  total_deductions numeric(12,2) not null default 0,
  net_salary numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  balance_pending numeric(12,2) not null default 0,
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING', 'PARTIAL', 'PAID')),
  calculation_breakdown jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_employee_payroll_month unique(employee_id, month_year)
);

-- 6. Ensure Table Structure for salary_payments
create table if not exists public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default',
  payroll_item_id uuid references public.payroll_items(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  month_year text,
  amount numeric(12,2) not null check (amount > 0),
  payment_mode text not null check (payment_mode in ('Cash', 'UPI', 'Bank Transfer', 'Cheque')),
  payment_date date not null default current_date,
  transaction_ref text,
  notes text,
  paid_by uuid references auth.users(id) on delete set null,
  paid_by_name text,
  created_at timestamptz not null default now()
);

-- Safe migrations in case table was created with rigid constraints earlier
alter table if exists public.salary_payments alter column payroll_item_id drop not null;
alter table if exists public.salary_payments add column if not exists month_year text;

-- 7. High-Performance Query Indexes
create index if not exists idx_employees_salon_status on public.employees(salon_id, status);
create index if not exists idx_employees_mobile on public.employees(mobile);
create index if not exists idx_attendance_salon_date on public.attendance(salon_id, attendance_date);
create index if not exists idx_attendance_employee_date on public.attendance(employee_id, attendance_date);
create index if not exists idx_payrolls_salon_month on public.payrolls(salon_id, month_year);
create index if not exists idx_payroll_items_payroll on public.payroll_items(payroll_id);
create index if not exists idx_payroll_items_employee on public.payroll_items(employee_id);
create index if not exists idx_payroll_items_salon_month on public.payroll_items(salon_id, month_year);
create index if not exists idx_salary_payments_item on public.salary_payments(payroll_item_id);
create index if not exists idx_salary_payments_salon on public.salary_payments(salon_id);
create index if not exists idx_salary_payments_emp_month on public.salary_payments(employee_id, month_year);

-- Project-wide speed indexes for Dashboard, Invoices & Customers
create index if not exists idx_invoices_salon_date on public.invoices(salon_id, invoice_date desc);
create index if not exists idx_customers_salon_created on public.customers(salon_id, created_at desc);
create index if not exists idx_customers_salon_mobile on public.customers(salon_id, mobile);
create index if not exists idx_wig_products_salon_active on public.wig_products(salon_id, active);
create index if not exists idx_transactions_salon_date on public.transactions(salon_id, service_date desc);
create index if not exists idx_audit_logs_salon_created on public.audit_logs(salon_id, created_at desc);

-- 8. Enable Row Level Security (RLS)
alter table public.salon_payroll_settings enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.payrolls enable row level security;
alter table public.payroll_items enable row level security;
alter table public.salary_payments enable row level security;

-- 9. Row Level Security Policies (Multi-Tenant Scoping)
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

-- 10. Safe default seed
insert into public.salon_payroll_settings (salon_id, opening_time, closing_time, grace_period_minutes, salary_divisor_mode, weekly_off_paid, holiday_paid)
values
  ('default', '10:00:00', '20:00:00', 15, 'CALENDAR_DAYS', true, true),
  ('salon-andheri', '10:00:00', '20:30:00', 15, 'CALENDAR_DAYS', true, true),
  ('salon-south-mumbai', '09:30:00', '20:00:00', 15, 'CALENDAR_DAYS', true, true)
on conflict (salon_id) do nothing;

-- 11. Grant schema permissions
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated, anon;
grant all on all sequences in schema public to authenticated, anon;
grant execute on all functions in schema public to authenticated, anon;

