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

-- 2) Timeline entries
create table if not exists public.timeline_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
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
  category text not null check (category in (
    'Food & Beverages',
    'Miscellaneous',
    'Groceries',
    'Cab',
    'Bus',
    'Train',
    'Tools or hardware',
    'Porter Delivery for Hardware'
  )),
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  receipt_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_timeline_entries_user_id on public.timeline_entries(user_id);
create index if not exists idx_timeline_entries_date on public.timeline_entries(date);
create index if not exists idx_expenses_user_id on public.expenses(user_id);
create index if not exists idx_expenses_date on public.expenses(date);

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
      'rajesh.b@vseek.in'
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

drop trigger if exists trg_prevent_non_admin_status_update on public.expenses;
create trigger trg_prevent_non_admin_status_update
before update on public.expenses
for each row execute function public.prevent_non_admin_status_update();

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.timeline_entries enable row level security;
alter table public.expenses enable row level security;

-- Profiles RLS
create policy "Profiles: self read or admin read"
on public.profiles
for select
using (id = auth.uid() or public.is_admin(auth.uid()));

create policy "Profiles: self update"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "Profiles: self insert"
on public.profiles
for insert
with check (id = auth.uid());

-- Timeline RLS
create policy "Timeline: owner insert"
on public.timeline_entries
for insert
with check (user_id = auth.uid());

create policy "Timeline: owner select or admin"
on public.timeline_entries
for select
using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "Timeline: owner update"
on public.timeline_entries
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Timeline: owner delete"
on public.timeline_entries
for delete
using (user_id = auth.uid());

-- Expenses RLS
create policy "Expenses: owner insert"
on public.expenses
for insert
with check (user_id = auth.uid());

create policy "Expenses: owner select or admin"
on public.expenses
for select
using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "Expenses: owner update"
on public.expenses
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Expenses: admin update any"
on public.expenses
for update
using (public.is_admin(auth.uid()))
with check (true);

create policy "Expenses: owner delete"
on public.expenses
for delete
using (user_id = auth.uid());

create policy "Expenses: admin delete"
on public.expenses
for delete
using (public.is_admin(auth.uid()));

-- Storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', true, 5242880, array['image/jpeg', 'image/png']),
  ('exports', 'exports', true, 10485760, array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- Storage policies: receipts
create policy "Receipts: owner can upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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

create policy "Receipts: owner can delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policies: exports
create policy "Exports: owner can upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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

create policy "Exports: owner can delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'exports'
  and (storage.foldername(name))[1] = auth.uid()::text
);
