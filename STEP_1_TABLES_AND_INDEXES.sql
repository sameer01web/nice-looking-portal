-- =====================================================================
-- STEP 1: CREATE TABLES & HIGH-PERFORMANCE INDEXES
-- Safe & Idempotent (Will not delete or overwrite any data)
-- =====================================================================

-- 1. Table: salon_payroll_settings
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

-- 2. Table: employees
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

-- 3. Table: attendance
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

-- 4. Table: payrolls
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

-- 5. Table: payroll_items
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

-- 6. Table: salary_payments
create table if not exists public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  salon_id text not null default 'default',
  payroll_item_id uuid not null references public.payroll_items(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_mode text not null check (payment_mode in ('Cash', 'UPI', 'Bank Transfer', 'Cheque')),
  payment_date date not null default current_date,
  transaction_ref text,
  notes text,
  paid_by uuid references auth.users(id) on delete set null,
  paid_by_name text,
  created_at timestamptz not null default now()
);

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

-- Project-wide speed indexes for Dashboard, Invoices & Customers
create index if not exists idx_invoices_salon_date on public.invoices(salon_id, invoice_date desc);
create index if not exists idx_customers_salon_created on public.customers(salon_id, created_at desc);
create index if not exists idx_customers_salon_mobile on public.customers(salon_id, mobile);
create index if not exists idx_wig_products_salon_active on public.wig_products(salon_id, active);
create index if not exists idx_transactions_salon_date on public.transactions(salon_id, service_date desc);
create index if not exists idx_audit_logs_salon_created on public.audit_logs(salon_id, created_at desc);

