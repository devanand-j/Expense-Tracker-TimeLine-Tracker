-- Team Timeline & Expense Tracker
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

-- 1) Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('employee', 'admin')) default 'employee',
  created_at timestamptz not null default now()
);

-- 1.1) Project master and employee assignments
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.employee_project_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table public.projects add column if not exists name text;
alter table public.projects add column if not exists is_active boolean not null default true;
alter table public.projects add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.projects add column if not exists created_at timestamptz not null default now();

alter table public.employee_project_assignments add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.employee_project_assignments add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.employee_project_assignments add column if not exists assigned_by uuid references public.profiles(id) on delete set null;
alter table public.employee_project_assignments add column if not exists created_at timestamptz not null default now();

-- 2) Timeline entries
create table if not exists public.timeline_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  shift text not null default 'day' check (shift in ('day', 'night')),
  project text not null check (length(trim(project)) > 0),
  duration numeric(6,2) not null check (duration >= 0),
  type text not null check (type in ('onsite', 'offsite', 'team_lunch', 'client_visit')),
  description text,
  created_at timestamptz not null default now()
);

-- 3) Expenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  expense_time time not null default localtime,
  project text not null check (length(trim(project)) > 0),
  category text not null check (category in (
    'Food & Beverages',
    'Travel',
    'Groceries',
    'Tools or Hardware',
    'Porter delivery for Hardware',
    'Miscellaneous'
  )),
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  receipt_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approval_comment text,
  status_history jsonb not null default '[]'::jsonb,
  conflict_flags jsonb not null default '[]'::jsonb,
  has_conflict boolean not null default false,
  last_reminder_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.expenses add column if not exists conflict_flags jsonb not null default '[]'::jsonb;
alter table public.expenses add column if not exists has_conflict boolean not null default false;
alter table public.expenses add column if not exists last_reminder_at timestamptz;
alter table public.expenses add column if not exists escalated_at timestamptz;
alter table public.expenses add column if not exists categories jsonb not null default '[]'::jsonb;

update public.expenses
set categories = jsonb_build_array(category)
where coalesce(jsonb_array_length(categories), 0) = 0
  and coalesce(trim(category), '') <> '';

update public.expenses
set category = 'Travel'
where category in ('Cab', 'Bus', 'Train');

update public.expenses
set category = 'Tools or Hardware'
where category = 'Tools or hardware';

update public.expenses
set category = 'Porter delivery for Hardware'
where category = 'Porter Delivery for Hardware';

insert into public.projects (name, created_by)
select distinct src.project_name, null::uuid
from (
  select trim(project) as project_name from public.expenses
  union
  select trim(project) as project_name from public.timeline_entries
) src
where coalesce(src.project_name, '') <> ''
on conflict (name) do nothing;

insert into public.employee_project_assignments (user_id, project_id, assigned_by)
select distinct src.user_id, p.id, null::uuid
from (
  select user_id, trim(project) as project_name from public.expenses
  union
  select user_id, trim(project) as project_name from public.timeline_entries
) src
join public.projects p on p.name = src.project_name
where src.user_id is not null
  and coalesce(src.project_name, '') <> ''
on conflict (user_id, project_id) do nothing;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'expenses_category_check'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses drop constraint expenses_category_check;
  end if;

  alter table public.expenses
    add constraint expenses_category_check
    check (category in (
      'Food & Beverages',
      'Travel',
      'Groceries',
      'Tools or Hardware',
      'Porter delivery for Hardware',
      'Miscellaneous'
    ));
end
$$;

-- 4) Leave requests
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  leave_type text not null check (leave_type in ('CL', 'SL', 'FMLA', 'Study Leave')),
  subject text not null check (length(trim(subject)) > 0),
  content text not null check (length(trim(content)) > 0),
  start_date date not null,
  end_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approval_comment text,
  status_history jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  last_reminder_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

alter table public.leave_requests add column if not exists leave_type text;
alter table public.leave_requests add column if not exists subject text;
alter table public.leave_requests add column if not exists content text;
alter table public.leave_requests add column if not exists start_date date;
alter table public.leave_requests add column if not exists end_date date;
alter table public.leave_requests add column if not exists status text not null default 'pending';
alter table public.leave_requests add column if not exists approval_comment text;
alter table public.leave_requests add column if not exists status_history jsonb not null default '[]'::jsonb;
alter table public.leave_requests add column if not exists submitted_at timestamptz not null default now();
alter table public.leave_requests add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.leave_requests add column if not exists reviewed_at timestamptz;
alter table public.leave_requests add column if not exists last_reminder_at timestamptz;
alter table public.leave_requests add column if not exists escalated_at timestamptz;
alter table public.leave_requests add column if not exists created_at timestamptz not null default now();
alter table public.leave_requests add column if not exists updated_at timestamptz not null default now();

-- 4) Reimbursement ledger
create table if not exists public.reimbursement_ledger (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null unique references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  approved_amount numeric(12,2) not null check (approved_amount >= 0),
  due_date date not null,
  paid_date date,
  payment_status text not null default 'queued' check (payment_status in ('queued', 'paid', 'cancelled')),
  payment_mode text,
  transaction_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reimbursement_ledger add column if not exists expense_id uuid;
alter table public.reimbursement_ledger add column if not exists user_id uuid;
alter table public.reimbursement_ledger add column if not exists approved_amount numeric(12,2) not null default 0;
alter table public.reimbursement_ledger add column if not exists due_date date;
alter table public.reimbursement_ledger add column if not exists paid_date date;
alter table public.reimbursement_ledger add column if not exists payment_status text not null default 'queued';
alter table public.reimbursement_ledger add column if not exists payment_mode text;
alter table public.reimbursement_ledger add column if not exists transaction_reference text;
alter table public.reimbursement_ledger add column if not exists notes text;
alter table public.reimbursement_ledger add column if not exists created_at timestamptz not null default now();
alter table public.reimbursement_ledger add column if not exists updated_at timestamptz not null default now();

-- 4) Weekly timesheets
create table if not exists public.weekly_timesheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  rows jsonb not null default '[]'::jsonb,
  total_hours numeric(8,2) not null default 0 check (total_hours >= 0),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'under_review', 'needs_changes', 'approved', 'rejected')),
  approval_comment text,
  status_history jsonb not null default '[]'::jsonb,
  conflict_flags jsonb not null default '[]'::jsonb,
  has_conflict boolean not null default false,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  last_reminder_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_timesheets add column if not exists week_end date;
alter table public.weekly_timesheets add column if not exists rows jsonb not null default '[]'::jsonb;
alter table public.weekly_timesheets add column if not exists total_hours numeric(8,2) not null default 0;
alter table public.weekly_timesheets add column if not exists status text not null default 'draft';
alter table public.weekly_timesheets add column if not exists approval_comment text;
alter table public.weekly_timesheets add column if not exists status_history jsonb not null default '[]'::jsonb;
alter table public.weekly_timesheets add column if not exists conflict_flags jsonb not null default '[]'::jsonb;
alter table public.weekly_timesheets add column if not exists has_conflict boolean not null default false;
alter table public.weekly_timesheets add column if not exists submitted_at timestamptz;
alter table public.weekly_timesheets add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.weekly_timesheets add column if not exists reviewed_at timestamptz;
alter table public.weekly_timesheets add column if not exists last_reminder_at timestamptz;
alter table public.weekly_timesheets add column if not exists escalated_at timestamptz;
alter table public.weekly_timesheets add column if not exists created_at timestamptz not null default now();
alter table public.weekly_timesheets add column if not exists updated_at timestamptz not null default now();

-- 4) Employee onboarding
create table if not exists public.employee_onboarding (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  employee_editable_data jsonb not null default '{}'::jsonb,
  hr_managed_data jsonb not null default '{}'::jsonb,
  onboarding_status text not null default 'draft' check (onboarding_status in ('draft', 'submitted', 'under_review', 'needs_changes', 'approved', 'rejected')),
  review_comment text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  declaration_confirmed boolean not null default false,
  signature_consent text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employee_onboarding add column if not exists employee_editable_data jsonb not null default '{}'::jsonb;
alter table public.employee_onboarding add column if not exists hr_managed_data jsonb not null default '{}'::jsonb;
alter table public.employee_onboarding add column if not exists onboarding_status text not null default 'draft';
alter table public.employee_onboarding add column if not exists review_comment text;
alter table public.employee_onboarding add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.employee_onboarding add column if not exists reviewed_at timestamptz;
alter table public.employee_onboarding add column if not exists declaration_confirmed boolean not null default false;
alter table public.employee_onboarding add column if not exists signature_consent text not null default '';
alter table public.employee_onboarding add column if not exists submitted_at timestamptz;
alter table public.employee_onboarding add column if not exists created_at timestamptz not null default now();
alter table public.employee_onboarding add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_timeline_entries_user_id on public.timeline_entries(user_id);
create index if not exists idx_timeline_entries_date on public.timeline_entries(date);
create unique index if not exists idx_projects_name_unique on public.projects(name);
create index if not exists idx_projects_is_active on public.projects(is_active);
create index if not exists idx_employee_project_assignments_user_id on public.employee_project_assignments(user_id);
create index if not exists idx_employee_project_assignments_project_id on public.employee_project_assignments(project_id);
create index if not exists idx_expenses_user_id on public.expenses(user_id);
create index if not exists idx_expenses_date on public.expenses(date);
create index if not exists idx_leave_requests_user_id on public.leave_requests(user_id);
create index if not exists idx_leave_requests_start_date on public.leave_requests(start_date);
create index if not exists idx_leave_requests_status on public.leave_requests(status);
create index if not exists idx_reimbursement_ledger_user_id on public.reimbursement_ledger(user_id);
create index if not exists idx_reimbursement_ledger_due_date on public.reimbursement_ledger(due_date);
create index if not exists idx_reimbursement_ledger_status on public.reimbursement_ledger(payment_status);
create index if not exists idx_weekly_timesheets_user_id on public.weekly_timesheets(user_id);
create index if not exists idx_weekly_timesheets_week_start on public.weekly_timesheets(week_start);
create index if not exists idx_weekly_timesheets_status on public.weekly_timesheets(status);
create unique index if not exists idx_weekly_timesheets_user_week_unique on public.weekly_timesheets(user_id, week_start);
create index if not exists idx_employee_onboarding_updated_at on public.employee_onboarding(updated_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_non_admin_onboarding_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    if old.hr_managed_data is distinct from new.hr_managed_data then
      raise exception 'Only admin can update HR managed onboarding data';
    end if;

    if old.review_comment is distinct from new.review_comment
      or old.reviewed_by is distinct from new.reviewed_by
      or old.reviewed_at is distinct from new.reviewed_at then
      raise exception 'Only admin can update onboarding review metadata';
    end if;

    if old.onboarding_status is distinct from new.onboarding_status
      and new.onboarding_status not in ('draft', 'submitted') then
      raise exception 'Only admin can set onboarding status beyond submitted';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_employee_onboarding_payload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  data jsonb;
  docs jsonb;
  dob_text text;
  pan text;
  pan_seq integer;
  prev_company jsonb;
begin
  data := coalesce(new.employee_editable_data, '{}'::jsonb);
  docs := coalesce(data -> 'documents', '{}'::jsonb);

  if not public.is_admin(auth.uid()) then
    if coalesce(new.hr_managed_data, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Only admin can set HR managed onboarding data';
    end if;

    if new.onboarding_status not in ('draft', 'submitted') then
      raise exception 'Only admin can set onboarding status beyond submitted';
    end if;
  end if;

  -- DOB must be at least 18 years.
  dob_text := nullif(trim(coalesce(data ->> 'date_of_birth', '')), '');
  if dob_text is null then
    raise exception 'Date of Birth is required';
  end if;
  if (dob_text)::date > (current_date - interval '18 years')::date then
    raise exception 'Date of Birth must be at least 18 years in the past';
  end if;

  -- Aadhaar strict format: #### #### #### #### (16 digits).
  if coalesce(data ->> 'aadhaar_number', '') !~ '^\d{4}\s\d{4}\s\d{4}\s\d{4}$' then
    raise exception 'Aadhaar must be in format #### #### #### ####';
  end if;

  -- PAN strict format and entity/sequence checks.
  pan := upper(coalesce(data ->> 'pan_number', ''));
  if pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'PAN must follow format AAAAA0000A';
  end if;
  if substring(pan from 4 for 1) not in ('P','C','H','F','T','A','B','G','J','L') then
    raise exception 'PAN 4th character is invalid';
  end if;
  pan_seq := substring(pan from 6 for 4)::integer;
  if pan_seq < 1 or pan_seq > 9999 then
    raise exception 'PAN sequence must be between 0001 and 9999';
  end if;

  -- UPI mandatory and format check.
  if coalesce(trim(data ->> 'upi_id'), '') = '' then
    raise exception 'UPI ID is required';
  end if;
  if coalesce(data ->> 'upi_id', '') !~ '^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$' then
    raise exception 'UPI ID format is invalid';
  end if;

  -- Required documents.
  if coalesce(trim(docs ->> 'aadhaar_card'), '') = ''
    or coalesce(trim(docs ->> 'pan_card'), '') = ''
    or coalesce(trim(docs ->> 'resume'), '') = ''
    or coalesce(trim(docs ->> 'passport_photo'), '') = ''
    or coalesce(trim(docs ->> 'cancelled_cheque_or_bank_proof'), '') = '' then
    raise exception 'Required onboarding documents are missing';
  end if;

  -- Declaration and signature.
  if coalesce(new.declaration_confirmed, false) = false then
    raise exception 'Declaration must be confirmed';
  end if;
  if coalesce(trim(new.signature_consent), '') = '' then
    raise exception 'Signature / digital consent is required';
  end if;

  -- Previous employment date checks.
  if lower(coalesce(data ->> 'worked_before', 'no')) = 'yes' then
    if jsonb_typeof(data -> 'previous_companies') <> 'array' or jsonb_array_length(data -> 'previous_companies') = 0 then
      raise exception 'At least one previous company is required';
    end if;

    for prev_company in select * from jsonb_array_elements(data -> 'previous_companies')
    loop
      if coalesce(trim(prev_company ->> 'joining_date'), '') = ''
        or coalesce(trim(prev_company ->> 'last_working_date'), '') = '' then
        raise exception 'Joining Date and Last Working Date are required for previous company';
      end if;
      if (prev_company ->> 'joining_date')::date > (prev_company ->> 'last_working_date')::date then
        raise exception 'Joining Date cannot be after Last Working Date';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_non_admin_weekly_timesheet_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    if old.status = 'approved' then
      raise exception 'Approved weekly timesheets cannot be edited by employee';
    end if;

    if old.user_id is distinct from new.user_id then
      raise exception 'Only the owner can update the weekly timesheet';
    end if;

    if old.status not in ('draft', 'needs_changes') then
      raise exception 'Weekly timesheets can only be edited while in draft or needs_changes';
    end if;

    if old.approval_comment is distinct from new.approval_comment
      or old.reviewed_by is distinct from new.reviewed_by
      or old.reviewed_at is distinct from new.reviewed_at
      or old.status_history is distinct from new.status_history then
      raise exception 'Only admin can update weekly timesheet approval metadata';
    end if;

    if old.status is distinct from new.status
      and new.status not in ('draft', 'submitted') then
      raise exception 'Only admin can set weekly timesheet status beyond submitted';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_non_admin_leave_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    if old.user_id is distinct from new.user_id then
      raise exception 'Only the owner can update the leave request';
    end if;

    if old.status = 'approved' then
      raise exception 'Approved leave requests cannot be edited by employee';
    end if;

    if old.approval_comment is distinct from new.approval_comment
      or old.reviewed_by is distinct from new.reviewed_by
      or old.reviewed_at is distinct from new.reviewed_at then
      raise exception 'Only admin can update leave approval metadata';
    end if;

    if old.status is distinct from new.status
      and new.status not in ('pending', 'cancelled') then
      raise exception 'Only admin can set leave status to approved or rejected';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_leave_request_payload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(new.subject), '') = '' then
    raise exception 'Leave subject is required';
  end if;

  if coalesce(trim(new.content), '') = '' then
    raise exception 'Leave content is required';
  end if;

  if new.end_date < new.start_date then
    raise exception 'Leave end date cannot be earlier than start date';
  end if;

  if not public.is_admin(auth.uid()) then
    if new.status not in ('pending', 'cancelled') then
      raise exception 'Only admin can set leave status to approved or rejected';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_weekly_timesheet_payload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_item jsonb;
  value_text text;
  value_num numeric;
  calc_total numeric := 0;
  day_date date;
  conflict_flags jsonb := '[]'::jsonb;
begin
  if new.week_end <> new.week_start + 6 then
    raise exception 'week_end must be 6 days after week_start';
  end if;

  if extract(isodow from new.week_start) <> 1 then
    raise exception 'week_start must be a Monday';
  end if;

  if jsonb_typeof(new.rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  for row_item in select * from jsonb_array_elements(new.rows)
  loop
    if not public.is_admin(auth.uid())
      and coalesce(trim(row_item ->> 'project'), '') <> ''
      and not public.is_project_assigned_to_employee(new.user_id, row_item ->> 'project') then
      raise exception 'Timesheet project is not assigned to employee';
    end if;

    -- monday
    value_text := coalesce(row_item ->> 'monday', '');
    if value_text <> '' then
      if value_text !~ '^\d+(\.\d+)?$' then raise exception 'Invalid monday hours'; end if;
      value_num := value_text::numeric;
      if value_num < 0 then raise exception 'Hours cannot be negative'; end if;
      day_date := new.week_start;
      if not public.is_admin(auth.uid()) then
        if day_date > current_date then raise exception 'Future day entries are not allowed'; end if;
        if day_date = current_date and localtime < time '11:59' then raise exception 'Current day entries are allowed only after 11:59 AM'; end if;
      end if;
      if value_num > 0 then
        if exists (
          select 1 from public.leave_requests l
          where l.user_id = new.user_id
            and l.status = 'approved'
            and day_date between l.start_date and l.end_date
        ) and not (conflict_flags @> '["leave_day_hours"]'::jsonb) then
          conflict_flags := conflict_flags || '"leave_day_hours"'::jsonb;
        end if;

        if exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type in ('onsite', 'team_lunch', 'client_visit')
        )
        and exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type = 'offsite'
        )
        and not (conflict_flags @> '["onsite_offsite_mixed_day"]'::jsonb) then
          conflict_flags := conflict_flags || '"onsite_offsite_mixed_day"'::jsonb;
        end if;
      end if;
      calc_total := calc_total + value_num;
    end if;

    -- tuesday
    value_text := coalesce(row_item ->> 'tuesday', '');
    if value_text <> '' then
      if value_text !~ '^\d+(\.\d+)?$' then raise exception 'Invalid tuesday hours'; end if;
      value_num := value_text::numeric;
      if value_num < 0 then raise exception 'Hours cannot be negative'; end if;
      day_date := new.week_start + 1;
      if not public.is_admin(auth.uid()) then
        if day_date > current_date then raise exception 'Future day entries are not allowed'; end if;
        if day_date = current_date and localtime < time '11:59' then raise exception 'Current day entries are allowed only after 11:59 AM'; end if;
      end if;
      if value_num > 0 then
        if exists (
          select 1 from public.leave_requests l
          where l.user_id = new.user_id
            and l.status = 'approved'
            and day_date between l.start_date and l.end_date
        ) and not (conflict_flags @> '["leave_day_hours"]'::jsonb) then
          conflict_flags := conflict_flags || '"leave_day_hours"'::jsonb;
        end if;

        if exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type in ('onsite', 'team_lunch', 'client_visit')
        )
        and exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type = 'offsite'
        )
        and not (conflict_flags @> '["onsite_offsite_mixed_day"]'::jsonb) then
          conflict_flags := conflict_flags || '"onsite_offsite_mixed_day"'::jsonb;
        end if;
      end if;
      calc_total := calc_total + value_num;
    end if;

    -- wednesday
    value_text := coalesce(row_item ->> 'wednesday', '');
    if value_text <> '' then
      if value_text !~ '^\d+(\.\d+)?$' then raise exception 'Invalid wednesday hours'; end if;
      value_num := value_text::numeric;
      if value_num < 0 then raise exception 'Hours cannot be negative'; end if;
      day_date := new.week_start + 2;
      if not public.is_admin(auth.uid()) then
        if day_date > current_date then raise exception 'Future day entries are not allowed'; end if;
        if day_date = current_date and localtime < time '11:59' then raise exception 'Current day entries are allowed only after 11:59 AM'; end if;
      end if;
      if value_num > 0 then
        if exists (
          select 1 from public.leave_requests l
          where l.user_id = new.user_id
            and l.status = 'approved'
            and day_date between l.start_date and l.end_date
        ) and not (conflict_flags @> '["leave_day_hours"]'::jsonb) then
          conflict_flags := conflict_flags || '"leave_day_hours"'::jsonb;
        end if;

        if exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type in ('onsite', 'team_lunch', 'client_visit')
        )
        and exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type = 'offsite'
        )
        and not (conflict_flags @> '["onsite_offsite_mixed_day"]'::jsonb) then
          conflict_flags := conflict_flags || '"onsite_offsite_mixed_day"'::jsonb;
        end if;
      end if;
      calc_total := calc_total + value_num;
    end if;

    -- thursday
    value_text := coalesce(row_item ->> 'thursday', '');
    if value_text <> '' then
      if value_text !~ '^\d+(\.\d+)?$' then raise exception 'Invalid thursday hours'; end if;
      value_num := value_text::numeric;
      if value_num < 0 then raise exception 'Hours cannot be negative'; end if;
      day_date := new.week_start + 3;
      if not public.is_admin(auth.uid()) then
        if day_date > current_date then raise exception 'Future day entries are not allowed'; end if;
        if day_date = current_date and localtime < time '11:59' then raise exception 'Current day entries are allowed only after 11:59 AM'; end if;
      end if;
      if value_num > 0 then
        if exists (
          select 1 from public.leave_requests l
          where l.user_id = new.user_id
            and l.status = 'approved'
            and day_date between l.start_date and l.end_date
        ) and not (conflict_flags @> '["leave_day_hours"]'::jsonb) then
          conflict_flags := conflict_flags || '"leave_day_hours"'::jsonb;
        end if;

        if exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type in ('onsite', 'team_lunch', 'client_visit')
        )
        and exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type = 'offsite'
        )
        and not (conflict_flags @> '["onsite_offsite_mixed_day"]'::jsonb) then
          conflict_flags := conflict_flags || '"onsite_offsite_mixed_day"'::jsonb;
        end if;
      end if;
      calc_total := calc_total + value_num;
    end if;

    -- friday
    value_text := coalesce(row_item ->> 'friday', '');
    if value_text <> '' then
      if value_text !~ '^\d+(\.\d+)?$' then raise exception 'Invalid friday hours'; end if;
      value_num := value_text::numeric;
      if value_num < 0 then raise exception 'Hours cannot be negative'; end if;
      day_date := new.week_start + 4;
      if not public.is_admin(auth.uid()) then
        if day_date > current_date then raise exception 'Future day entries are not allowed'; end if;
        if day_date = current_date and localtime < time '11:59' then raise exception 'Current day entries are allowed only after 11:59 AM'; end if;
      end if;
      if value_num > 0 then
        if exists (
          select 1 from public.leave_requests l
          where l.user_id = new.user_id
            and l.status = 'approved'
            and day_date between l.start_date and l.end_date
        ) and not (conflict_flags @> '["leave_day_hours"]'::jsonb) then
          conflict_flags := conflict_flags || '"leave_day_hours"'::jsonb;
        end if;

        if exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type in ('onsite', 'team_lunch', 'client_visit')
        )
        and exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type = 'offsite'
        )
        and not (conflict_flags @> '["onsite_offsite_mixed_day"]'::jsonb) then
          conflict_flags := conflict_flags || '"onsite_offsite_mixed_day"'::jsonb;
        end if;
      end if;
      calc_total := calc_total + value_num;
    end if;

    -- saturday
    value_text := coalesce(row_item ->> 'saturday', '');
    if value_text <> '' then
      if value_text !~ '^\d+(\.\d+)?$' then raise exception 'Invalid saturday hours'; end if;
      value_num := value_text::numeric;
      if value_num < 0 then raise exception 'Hours cannot be negative'; end if;
      day_date := new.week_start + 5;
      if not public.is_admin(auth.uid()) then
        if day_date > current_date then raise exception 'Future day entries are not allowed'; end if;
        if day_date = current_date and localtime < time '11:59' then raise exception 'Current day entries are allowed only after 11:59 AM'; end if;
      end if;
      if value_num > 0 then
        if exists (
          select 1 from public.leave_requests l
          where l.user_id = new.user_id
            and l.status = 'approved'
            and day_date between l.start_date and l.end_date
        ) and not (conflict_flags @> '["leave_day_hours"]'::jsonb) then
          conflict_flags := conflict_flags || '"leave_day_hours"'::jsonb;
        end if;

        if exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type in ('onsite', 'team_lunch', 'client_visit')
        )
        and exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type = 'offsite'
        )
        and not (conflict_flags @> '["onsite_offsite_mixed_day"]'::jsonb) then
          conflict_flags := conflict_flags || '"onsite_offsite_mixed_day"'::jsonb;
        end if;
      end if;
      calc_total := calc_total + value_num;
    end if;

    -- sunday
    value_text := coalesce(row_item ->> 'sunday', '');
    if value_text <> '' then
      if value_text !~ '^\d+(\.\d+)?$' then raise exception 'Invalid sunday hours'; end if;
      value_num := value_text::numeric;
      if value_num < 0 then raise exception 'Hours cannot be negative'; end if;
      day_date := new.week_start + 6;
      if not public.is_admin(auth.uid()) then
        if day_date > current_date then raise exception 'Future day entries are not allowed'; end if;
        if day_date = current_date and localtime < time '11:59' then raise exception 'Current day entries are allowed only after 11:59 AM'; end if;
      end if;
      if value_num > 0 then
        if exists (
          select 1 from public.leave_requests l
          where l.user_id = new.user_id
            and l.status = 'approved'
            and day_date between l.start_date and l.end_date
        ) and not (conflict_flags @> '["leave_day_hours"]'::jsonb) then
          conflict_flags := conflict_flags || '"leave_day_hours"'::jsonb;
        end if;

        if exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type in ('onsite', 'team_lunch', 'client_visit')
        )
        and exists (
          select 1
          from public.timeline_entries t
          where t.user_id = new.user_id
            and t.date = day_date
            and t.type = 'offsite'
        )
        and not (conflict_flags @> '["onsite_offsite_mixed_day"]'::jsonb) then
          conflict_flags := conflict_flags || '"onsite_offsite_mixed_day"'::jsonb;
        end if;
      end if;
      calc_total := calc_total + value_num;
    end if;
  end loop;

  new.total_hours := round(calc_total::numeric, 2);

  if new.status = 'submitted' and new.total_hours <= 0 then
    raise exception 'Cannot submit weekly timesheet with 0 total hours';
  end if;

  new.conflict_flags := conflict_flags;
  new.has_conflict := jsonb_array_length(conflict_flags) > 0;

  return new;
end;
$$;

drop trigger if exists trg_set_employee_onboarding_updated_at on public.employee_onboarding;
create trigger trg_set_employee_onboarding_updated_at
before update on public.employee_onboarding
for each row execute function public.set_updated_at();

drop trigger if exists trg_validate_employee_onboarding_payload on public.employee_onboarding;
create trigger trg_validate_employee_onboarding_payload
before insert or update on public.employee_onboarding
for each row execute function public.validate_employee_onboarding_payload();

drop trigger if exists trg_prevent_non_admin_onboarding_update on public.employee_onboarding;
create trigger trg_prevent_non_admin_onboarding_update
before update on public.employee_onboarding
for each row execute function public.prevent_non_admin_onboarding_update();

-- Role helper
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

create or replace function public.is_project_assigned_to_employee(uid uuid, project_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employee_project_assignments a
    join public.projects p on p.id = a.project_id
    where a.user_id = uid
      and p.is_active = true
      and p.name = trim(coalesce(project_name, ''))
  );
$$;

create or replace function public.validate_timeline_project_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    if not public.is_project_assigned_to_employee(new.user_id, new.project) then
      raise exception 'Timeline project is not assigned to employee';
    end if;
  end if;

  return new;
end;
$$;

-- Predefined admin emails (IMPORTANT: edit this list)
create or replace function public.is_admin_email(email text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(email, '')) = any (
    array[
      'devanand3254@gmail.com',
      'ankit.k@vseek.in',
      'sagar.s@vseek.in',
      'dinesh.b@vseek.in',
      'rajesh.b@vseek.in',
      'sunil.g@vseek.in'
    ]
  );
$$;

-- Auto-create profile on first auth user creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    case
      when public.is_admin_email(new.email) then 'admin'
      else 'employee'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists trg_validate_timeline_project_assignment on public.timeline_entries;
create trigger trg_validate_timeline_project_assignment
before insert or update on public.timeline_entries
for each row execute function public.validate_timeline_project_assignment();

-- Prevent non-admin from changing expense status
create or replace function public.prevent_non_admin_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status and not public.is_admin(auth.uid()) then
    raise exception 'Only admin can update expense status';
  end if;

  return new;
end;
$$;

create or replace function public.validate_expense_payload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_flags jsonb := '[]'::jsonb;
  porter_on_leave_exception boolean := false;
  normalized_categories jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(new.categories) <> 'array' or coalesce(jsonb_array_length(new.categories), 0) = 0 then
    if coalesce(trim(new.category), '') = '' then
      raise exception 'At least one expense category is required';
    end if;
    new.categories := jsonb_build_array(new.category);
  end if;

  select coalesce(jsonb_agg(distinct category_name), '[]'::jsonb)
  into normalized_categories
  from (
    select nullif(trim(value), '') as category_name
    from jsonb_array_elements_text(new.categories) as t(value)
  ) category_src
  where category_name is not null;

  if coalesce(jsonb_array_length(normalized_categories), 0) = 0 then
    raise exception 'At least one expense category is required';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(normalized_categories) as t(value)
    where value not in (
      'Food & Beverages',
      'Travel',
      'Groceries',
      'Tools or Hardware',
      'Porter delivery for Hardware',
      'Miscellaneous'
    )
  ) then
    raise exception 'Invalid expense category selected';
  end if;

  new.categories := normalized_categories;
  new.category := coalesce((select value from jsonb_array_elements_text(normalized_categories) as t(value) limit 1), 'Miscellaneous');

  if not public.is_admin(auth.uid()) then
    if new.date > current_date then
      raise exception 'Future expense dates are not allowed';
    end if;

    if not public.is_project_assigned_to_employee(new.user_id, new.project) then
      raise exception 'Expense project is not assigned to employee';
    end if;

    -- Exception: porter delivery expense is allowed on approved leave dates.
    porter_on_leave_exception := (
      normalized_categories @> '["Porter delivery for Hardware"]'::jsonb
      and exists (
        select 1
        from public.leave_requests l
        where l.user_id = new.user_id
          and l.status = 'approved'
          and new.date between l.start_date and l.end_date
      )
    );

    if exists (
      select 1
      from public.leave_requests l
      where l.user_id = new.user_id
        and l.status = 'approved'
        and new.date between l.start_date and l.end_date
    ) and not porter_on_leave_exception then
      raise exception 'Expense cannot be raised on approved leave dates';
    end if;

    if exists (
      select 1
      from public.timeline_entries t
      where t.user_id = new.user_id
        and t.date = new.date
        and t.type = 'offsite'
    ) then
      raise exception 'Expense cannot be raised for an offsite day';
    end if;

    -- For non-exception cases, expense date must come from an approved timesheet day with hours.
    if not exists (
      select 1
      from public.weekly_timesheets w
      join lateral jsonb_array_elements(w.rows) row_item on true
      where w.user_id = new.user_id
        and w.status = 'approved'
        and new.date between w.week_start and w.week_end
        and (
          case extract(dow from new.date)::int
            when 1 then coalesce((nullif(row_item ->> 'monday', ''))::numeric, 0)
            when 2 then coalesce((nullif(row_item ->> 'tuesday', ''))::numeric, 0)
            when 3 then coalesce((nullif(row_item ->> 'wednesday', ''))::numeric, 0)
            when 4 then coalesce((nullif(row_item ->> 'thursday', ''))::numeric, 0)
            when 5 then coalesce((nullif(row_item ->> 'friday', ''))::numeric, 0)
            when 6 then coalesce((nullif(row_item ->> 'saturday', ''))::numeric, 0)
            when 0 then coalesce((nullif(row_item ->> 'sunday', ''))::numeric, 0)
            else 0
          end
        ) > 0
    ) and not porter_on_leave_exception then
      raise exception 'Expense can be added only on approved timesheet dates with logged hours';
    end if;
  end if;

  if exists (
    select 1
    from public.leave_requests l
    where l.user_id = new.user_id
      and l.status = 'approved'
      and new.date between l.start_date and l.end_date
  ) then
    conflict_flags := conflict_flags || '"leave_day_expense"'::jsonb;
  end if;

  if exists (
    select 1
    from public.timeline_entries t
    where t.user_id = new.user_id
      and t.date = new.date
      and t.type in ('onsite', 'team_lunch', 'client_visit')
  )
  and exists (
    select 1
    from public.timeline_entries t
    where t.user_id = new.user_id
      and t.date = new.date
      and t.type = 'offsite'
  ) then
    conflict_flags := conflict_flags || '"onsite_offsite_mixed_day"'::jsonb;
  end if;

  new.conflict_flags := conflict_flags;
  new.has_conflict := jsonb_array_length(conflict_flags) > 0;

  return new;
end;
$$;

create or replace function public.sync_reimbursement_ledger_from_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    insert into public.reimbursement_ledger (
      expense_id,
      user_id,
      approved_amount,
      due_date,
      payment_status
    )
    values (
      new.id,
      new.user_id,
      new.amount,
      coalesce(new.date, current_date) + interval '7 day',
      'queued'
    )
    on conflict (expense_id) do update set
      user_id = excluded.user_id,
      approved_amount = excluded.approved_amount,
      due_date = coalesce(public.reimbursement_ledger.due_date, excluded.due_date),
      payment_status = case
        when public.reimbursement_ledger.payment_status = 'paid' then 'paid'
        else 'queued'
      end;
  elsif new.status in ('pending', 'rejected') then
    update public.reimbursement_ledger
    set payment_status = case
      when payment_status = 'paid' then payment_status
      else 'cancelled'
    end
    where expense_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_non_admin_status_update on public.expenses;
create trigger trg_prevent_non_admin_status_update
before update on public.expenses
for each row execute function public.prevent_non_admin_status_update();

create or replace function public.prevent_non_admin_expense_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'approved' and not public.is_admin(auth.uid()) then
    raise exception 'Approved expenses cannot be deleted by employee';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_prevent_non_admin_expense_delete on public.expenses;
create trigger trg_prevent_non_admin_expense_delete
before delete on public.expenses
for each row execute function public.prevent_non_admin_expense_delete();

drop trigger if exists trg_validate_expense_payload on public.expenses;
create trigger trg_validate_expense_payload
before insert or update on public.expenses
for each row execute function public.validate_expense_payload();

drop trigger if exists trg_sync_reimbursement_ledger_from_expense on public.expenses;
create trigger trg_sync_reimbursement_ledger_from_expense
after insert or update of status, amount, date on public.expenses
for each row execute function public.sync_reimbursement_ledger_from_expense();

drop trigger if exists trg_set_reimbursement_ledger_updated_at on public.reimbursement_ledger;
create trigger trg_set_reimbursement_ledger_updated_at
before update on public.reimbursement_ledger
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_leave_requests_updated_at on public.leave_requests;
create trigger trg_set_leave_requests_updated_at
before update on public.leave_requests
for each row execute function public.set_updated_at();

drop trigger if exists trg_validate_leave_request_payload on public.leave_requests;
create trigger trg_validate_leave_request_payload
before insert or update on public.leave_requests
for each row execute function public.validate_leave_request_payload();

drop trigger if exists trg_prevent_non_admin_leave_request_update on public.leave_requests;
create trigger trg_prevent_non_admin_leave_request_update
before update on public.leave_requests
for each row execute function public.prevent_non_admin_leave_request_update();

drop trigger if exists trg_set_weekly_timesheets_updated_at on public.weekly_timesheets;
create trigger trg_set_weekly_timesheets_updated_at
before update on public.weekly_timesheets
for each row execute function public.set_updated_at();

drop trigger if exists trg_validate_weekly_timesheet_payload on public.weekly_timesheets;
create trigger trg_validate_weekly_timesheet_payload
before insert or update on public.weekly_timesheets
for each row execute function public.validate_weekly_timesheet_payload();

drop trigger if exists trg_prevent_non_admin_weekly_timesheet_update on public.weekly_timesheets;
create trigger trg_prevent_non_admin_weekly_timesheet_update
before update on public.weekly_timesheets
for each row execute function public.prevent_non_admin_weekly_timesheet_update();

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.employee_project_assignments enable row level security;
alter table public.timeline_entries enable row level security;
alter table public.expenses enable row level security;
alter table public.leave_requests enable row level security;
alter table public.reimbursement_ledger enable row level security;
alter table public.weekly_timesheets enable row level security;
alter table public.employee_onboarding enable row level security;

-- Projects RLS
drop policy if exists "Projects: authenticated select" on public.projects;
create policy "Projects: authenticated select"
on public.projects
for select
to authenticated
using (true);

drop policy if exists "Projects: admin insert" on public.projects;
create policy "Projects: admin insert"
on public.projects
for insert
to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists "Projects: admin update" on public.projects;
create policy "Projects: admin update"
on public.projects
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Projects: admin delete" on public.projects;
create policy "Projects: admin delete"
on public.projects
for delete
to authenticated
using (public.is_admin(auth.uid()));

-- Employee project assignments RLS
drop policy if exists "Assignments: owner select or admin" on public.employee_project_assignments;
create policy "Assignments: owner select or admin"
on public.employee_project_assignments
for select
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Assignments: admin insert" on public.employee_project_assignments;
create policy "Assignments: admin insert"
on public.employee_project_assignments
for insert
to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists "Assignments: admin update" on public.employee_project_assignments;
create policy "Assignments: admin update"
on public.employee_project_assignments
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Assignments: admin delete" on public.employee_project_assignments;
create policy "Assignments: admin delete"
on public.employee_project_assignments
for delete
to authenticated
using (public.is_admin(auth.uid()));

-- Profiles RLS
drop policy if exists "Profiles: self read or admin read" on public.profiles;
create policy "Profiles: self read or admin read"
on public.profiles
for select
using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Profiles: self update" on public.profiles;
create policy "Profiles: self update"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Profiles: self insert" on public.profiles;
create policy "Profiles: self insert"
on public.profiles
for insert
with check (id = auth.uid());

-- Timeline RLS
drop policy if exists "Timeline: owner insert" on public.timeline_entries;
create policy "Timeline: owner insert"
on public.timeline_entries
for insert
with check (user_id = auth.uid());

drop policy if exists "Timeline: owner select or admin" on public.timeline_entries;
create policy "Timeline: owner select or admin"
on public.timeline_entries
for select
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Timeline: owner update" on public.timeline_entries;
create policy "Timeline: owner update"
on public.timeline_entries
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Timeline: owner delete" on public.timeline_entries;
create policy "Timeline: owner delete"
on public.timeline_entries
for delete
using (user_id = auth.uid());

-- Expenses RLS
drop policy if exists "Expenses: owner insert" on public.expenses;
create policy "Expenses: owner insert"
on public.expenses
for insert
with check (user_id = auth.uid());

drop policy if exists "Expenses: owner select or admin" on public.expenses;
create policy "Expenses: owner select or admin"
on public.expenses
for select
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Expenses: owner update" on public.expenses;
create policy "Expenses: owner update"
on public.expenses
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Expenses: admin update any" on public.expenses;
create policy "Expenses: admin update any"
on public.expenses
for update
using (public.is_admin(auth.uid()))
with check (true);

drop policy if exists "Expenses: owner delete" on public.expenses;
create policy "Expenses: owner delete"
on public.expenses
for delete
using (user_id = auth.uid());

drop policy if exists "Expenses: admin delete" on public.expenses;
create policy "Expenses: admin delete"
on public.expenses
for delete
using (public.is_admin(auth.uid()));

-- Reimbursement ledger RLS
drop policy if exists "Reimbursement: owner select or admin" on public.reimbursement_ledger;
create policy "Reimbursement: owner select or admin"
on public.reimbursement_ledger
for select
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Reimbursement: admin insert" on public.reimbursement_ledger;
create policy "Reimbursement: admin insert"
on public.reimbursement_ledger
for insert
with check (public.is_admin(auth.uid()));

drop policy if exists "Reimbursement: admin update" on public.reimbursement_ledger;
create policy "Reimbursement: admin update"
on public.reimbursement_ledger
for update
using (public.is_admin(auth.uid()))
with check (true);

drop policy if exists "Reimbursement: admin delete" on public.reimbursement_ledger;
create policy "Reimbursement: admin delete"
on public.reimbursement_ledger
for delete
using (public.is_admin(auth.uid()));

-- Leave requests RLS
drop policy if exists "Leave: owner insert" on public.leave_requests;
create policy "Leave: owner insert"
on public.leave_requests
for insert
with check (user_id = auth.uid());

drop policy if exists "Leave: owner select or admin" on public.leave_requests;
create policy "Leave: owner select or admin"
on public.leave_requests
for select
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Leave: owner update" on public.leave_requests;
create policy "Leave: owner update"
on public.leave_requests
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Leave: admin update any" on public.leave_requests;
create policy "Leave: admin update any"
on public.leave_requests
for update
using (public.is_admin(auth.uid()))
with check (true);

drop policy if exists "Leave: owner delete" on public.leave_requests;
create policy "Leave: owner delete"
on public.leave_requests
for delete
using (user_id = auth.uid());

drop policy if exists "Leave: admin delete any" on public.leave_requests;
create policy "Leave: admin delete any"
on public.leave_requests
for delete
using (public.is_admin(auth.uid()));

-- Weekly timesheets RLS
drop policy if exists "Weekly timesheets: owner insert" on public.weekly_timesheets;
create policy "Weekly timesheets: owner insert"
on public.weekly_timesheets
for insert
with check (user_id = auth.uid());

drop policy if exists "Weekly timesheets: owner select or admin" on public.weekly_timesheets;
create policy "Weekly timesheets: owner select or admin"
on public.weekly_timesheets
for select
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Weekly timesheets: owner update" on public.weekly_timesheets;
create policy "Weekly timesheets: owner update"
on public.weekly_timesheets
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- NOTE: Admin update policy uses `with check (true)` which allows updating any column.
-- For tighter security, consider restricting to only status/approval_comment/reviewed_at/reviewed_by fields.
-- Example: with check (user_id = (select user_id from weekly_timesheets where id = weekly_timesheets.id))
drop policy if exists "Weekly timesheets: admin update any" on public.weekly_timesheets;
create policy "Weekly timesheets: admin update any"
on public.weekly_timesheets
for update
using (public.is_admin(auth.uid()))
with check (true);

drop policy if exists "Weekly timesheets: owner delete" on public.weekly_timesheets;
create policy "Weekly timesheets: owner delete"
on public.weekly_timesheets
for delete
using (user_id = auth.uid());

drop policy if exists "Weekly timesheets: admin delete any" on public.weekly_timesheets;
create policy "Weekly timesheets: admin delete any"
on public.weekly_timesheets
for delete
using (public.is_admin(auth.uid()));

-- Employee onboarding RLS
drop policy if exists "Onboarding: owner insert" on public.employee_onboarding;
create policy "Onboarding: owner insert"
on public.employee_onboarding
for insert
with check (user_id = auth.uid());

drop policy if exists "Onboarding: owner select or admin" on public.employee_onboarding;
create policy "Onboarding: owner select or admin"
on public.employee_onboarding
for select
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Onboarding: owner update" on public.employee_onboarding;
create policy "Onboarding: owner update"
on public.employee_onboarding
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Onboarding: admin update any" on public.employee_onboarding;
create policy "Onboarding: admin update any"
on public.employee_onboarding
for update
using (public.is_admin(auth.uid()))
with check (true);

-- Storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', true, 1048576, array['image/jpeg', 'image/png']),
  ('exports', 'exports', true, 10485760, array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('employee-documents', 'employee-documents', false, 1048576, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Storage policies: receipts
drop policy if exists "Receipts: owner can upload" on storage.objects;
create policy "Receipts: owner can upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Receipts: owner or admin can read" on storage.objects;
create policy "Receipts: owner or admin can read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'receipts'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin(auth.uid())
  )
);

drop policy if exists "Receipts: owner can delete" on storage.objects;
create policy "Receipts: owner can delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policies: exports
drop policy if exists "Exports: owner can upload" on storage.objects;
create policy "Exports: owner can upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Exports: owner or admin can read" on storage.objects;
create policy "Exports: owner or admin can read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'exports'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin(auth.uid())
  )
);

drop policy if exists "Exports: owner can delete" on storage.objects;
create policy "Exports: owner can delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policies: employee-documents
drop policy if exists "Employee documents: owner can upload" on storage.objects;
create policy "Employee documents: owner can upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Employee documents: owner or admin can read" on storage.objects;
create policy "Employee documents: owner or admin can read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin(auth.uid())
  )
);

drop policy if exists "Employee documents: owner can delete" on storage.objects;
create policy "Employee documents: owner can delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
