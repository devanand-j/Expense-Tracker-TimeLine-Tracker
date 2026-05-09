-- ============================================================
-- AUDIT LOGS MIGRATION
-- Run this in Supabase SQL editor to add audit logging
-- ============================================================

-- 1) AUDIT LOGS TABLE
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  table_name text not null check (length(trim(table_name)) > 0),
  record_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT')),
  old_values jsonb,
  new_values jsonb,
  changes jsonb,
  reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- Indexes for audit logs
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_table_name on public.audit_logs(table_name);
create index if not exists idx_audit_logs_record_id on public.audit_logs(record_id);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);
create index if not exists idx_audit_logs_created_by on public.audit_logs(created_by);

-- 2) HELPER FUNCTION TO LOG CHANGES
create or replace function public.log_audit_event(
  p_user_id uuid,
  p_table_name text,
  p_record_id uuid,
  p_action text,
  p_old_values jsonb default null,
  p_new_values jsonb default null,
  p_reason text default null,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
begin
  -- Calculate changes only if we have both old and new values
  if p_old_values is not null and p_new_values is not null then
    for v_key in select jsonb_object_keys(p_new_values)
    loop
      if p_old_values ->> v_key is distinct from p_new_values ->> v_key then
        v_changes := jsonb_set(v_changes, array[v_key], jsonb_build_object('old', p_old_values -> v_key, 'new', p_new_values -> v_key));
      end if;
    end loop;
  end if;

  insert into public.audit_logs (
    user_id,
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    changes,
    reason,
    ip_address,
    user_agent,
    created_by
  )
  values (
    p_user_id,
    p_table_name,
    p_record_id,
    p_action,
    p_old_values,
    p_new_values,
    v_changes,
    p_reason,
    p_ip_address,
    p_user_agent,
    p_user_id
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- 3) TRIGGER FUNCTION TO AUTO-LOG EXPENSE APPROVALS
create or replace function public.log_expense_approval_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    perform public.log_audit_event(
      p_user_id := auth.uid(),
      p_table_name := 'expenses',
      p_record_id := new.id,
      p_action := case
        when new.status = 'approved' then 'APPROVE'
        when new.status = 'rejected' then 'REJECT'
        else 'UPDATE'
      end,
      p_old_values := jsonb_build_object('status', old.status, 'approval_comment', old.approval_comment),
      p_new_values := jsonb_build_object('status', new.status, 'approval_comment', new.approval_comment),
      p_reason := new.approval_comment
    );
  end if;

  return new;
end;
$$;

-- 4) CREATE TRIGGER FOR EXPENSE APPROVALS
drop trigger if exists trg_log_expense_approval on public.expenses;
create trigger trg_log_expense_approval
  after update on public.expenses
  for each row
  execute function public.log_expense_approval_changes();

-- 5) RLS POLICIES FOR AUDIT LOGS
alter table public.audit_logs enable row level security;

-- Admins can view all audit logs
create policy "Admins can view all audit logs"
  on public.audit_logs for select
  using (is_admin(auth.uid()));

-- Users can view their own audit logs
create policy "Users can view own audit logs"
  on public.audit_logs for select
  using (user_id = auth.uid());
-- 6) TRIGGER FUNCTION TO AUTO-LOG WEEKLY_TIMESHEET APPROVALS
create or replace function public.log_timesheet_approval_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    perform public.log_audit_event(
      p_user_id := auth.uid(),
      p_table_name := 'weekly_timesheets',
      p_record_id := new.id,
      p_action := case
        when new.status = 'approved' then 'APPROVE'
        when new.status = 'rejected' then 'REJECT'
        when new.status = 'needs_changes' then 'UPDATE'
        else 'UPDATE'
      end,
      p_old_values := jsonb_build_object('status', old.status, 'approval_comment', old.approval_comment),
      p_new_values := jsonb_build_object('status', new.status, 'approval_comment', new.approval_comment),
      p_reason := new.approval_comment
    );

    -- Create notifications
    if new.status = 'approved' then
      perform public.create_notification(
        p_user_id := new.user_id,
        p_title := 'Timesheet Approved',
        p_message := 'Your timesheet for week ' || new.week_start || ' has been approved',
        p_notification_type := 'timesheet_approved',
        p_related_table := 'weekly_timesheets',
        p_related_record_id := new.id,
        p_related_user_id := auth.uid(),
        p_action_url := '/timesheet',
        p_priority := 'normal'
      );
    elsif new.status = 'rejected' then
      perform public.create_notification(
        p_user_id := new.user_id,
        p_title := 'Timesheet Rejected',
        p_message := 'Your timesheet has been rejected. Reason: ' || coalesce(new.approval_comment, 'No reason provided'),
        p_notification_type := 'timesheet_rejected',
        p_related_table := 'weekly_timesheets',
        p_related_record_id := new.id,
        p_related_user_id := auth.uid(),
        p_action_url := '/timesheet',
        p_priority := 'high'
      );
    elsif new.status = 'needs_changes' then
      perform public.create_notification(
        p_user_id := new.user_id,
        p_title := 'Timesheet Needs Changes',
        p_message := 'Your timesheet needs changes: ' || coalesce(new.approval_comment, 'Please review and resubmit'),
        p_notification_type := 'timesheet_needs_changes',
        p_related_table := 'weekly_timesheets',
        p_related_record_id := new.id,
        p_related_user_id := auth.uid(),
        p_action_url := '/timesheet',
        p_priority := 'high'
      );
    end if;
  end if;

  return new;
end;
$$;

-- 8) TRIGGER FUNCTION TO AUTO-LOG LEAVE APPROVALS
create or replace function public.log_leave_approval_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    perform public.log_audit_event(
      p_user_id := auth.uid(),
      p_table_name := 'leave_requests',
      p_record_id := new.id,
      p_action := case
        when new.status = 'approved' then 'APPROVE'
        when new.status = 'rejected' then 'REJECT'
        else 'UPDATE'
      end,
      p_old_values := jsonb_build_object('status', old.status, 'approval_comment', old.approval_comment),
      p_new_values := jsonb_build_object('status', new.status, 'approval_comment', new.approval_comment),
      p_reason := new.approval_comment
    );

    -- Create notifications
    if new.status = 'approved' then
      perform public.create_notification(
        p_user_id := new.user_id,
        p_title := 'Leave Approved',
        p_message := 'Your leave request from ' || new.start_date || ' to ' || new.end_date || ' has been approved',
        p_notification_type := 'leave_approved',
        p_related_table := 'leave_requests',
        p_related_record_id := new.id,
        p_related_user_id := auth.uid(),
        p_action_url := '/leave',
        p_priority := 'normal'
      );
    elsif new.status = 'rejected' then
      perform public.create_notification(
        p_user_id := new.user_id,
        p_title := 'Leave Rejected',
        p_message := 'Your leave request has been rejected. Reason: ' || coalesce(new.approval_comment, 'No reason provided'),
        p_notification_type := 'leave_rejected',
        p_related_table := 'leave_requests',
        p_related_record_id := new.id,
        p_related_user_id := auth.uid(),
        p_action_url := '/leave',
        p_priority := 'high'
      );
    end if;
  end if;

  return new;
end;
$$;

-- 9) CREATE TRIGGERS FOR AUTO-LOGGING
drop trigger if exists trg_log_expense_approval_changes on public.expenses;
create trigger trg_log_expense_approval_changes
after update on public.expenses
for each row
when (old.status is distinct from new.status)
execute function public.log_expense_approval_changes();

drop trigger if exists trg_log_timesheet_approval_changes on public.weekly_timesheets;
create trigger trg_log_timesheet_approval_changes
after update on public.weekly_timesheets
for each row
when (old.status is distinct from new.status)
execute function public.log_timesheet_approval_changes();

drop trigger if exists trg_log_leave_approval_changes on public.leave_requests;
create trigger trg_log_leave_approval_changes
after update on public.leave_requests
for each row
when (old.status is distinct from new.status)
execute function public.log_leave_approval_changes();

-- 10) RLS POLICIES FOR AUDIT LOGS
alter table public.audit_logs enable row level security;

drop policy if exists "Audit Logs: admins can view all" on public.audit_logs;
create policy "Audit Logs: admins can view all"
on public.audit_logs
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Audit Logs: users can view their own" on public.audit_logs;
create policy "Audit Logs: users can view their own"
on public.audit_logs
for select
to authenticated
using (user_id = auth.uid() or created_by = auth.uid());

-- 11) RLS POLICIES FOR NOTIFICATIONS
alter table public.notifications enable row level security;

drop policy if exists "Notifications: users can view their own" on public.notifications;
create policy "Notifications: users can view their own"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Notifications: system can insert" on public.notifications;
create policy "Notifications: system can insert"
on public.notifications
for insert
to authenticated
with check (true);

drop policy if exists "Notifications: users can update their own" on public.notifications;
create policy "Notifications: users can update their own"
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Notifications: users can delete their own" on public.notifications;
create policy "Notifications: users can delete their own"
on public.notifications
for delete
to authenticated
using (user_id = auth.uid());

-- 12) RLS POLICIES FOR NOTIFICATION PREFERENCES
alter table public.notification_preferences enable row level security;

drop policy if exists "Notification Preferences: users can view own" on public.notification_preferences;
create policy "Notification Preferences: users can view own"
on public.notification_preferences
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Notification Preferences: users can update own" on public.notification_preferences;
create policy "Notification Preferences: users can update own"
on public.notification_preferences
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Notification Preferences: users can insert own" on public.notification_preferences;
create policy "Notification Preferences: users can insert own"
on public.notification_preferences
for insert
to authenticated
with check (user_id = auth.uid());
