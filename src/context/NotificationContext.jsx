import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user, profile } = useAuth();
  const [pendingCounts, setPendingCounts] = useState({ expenses: 0, leaves: 0, timesheets: 0 });

  async function fetchCounts() {
    if (!user || profile?.role !== 'admin') return;

    const [expRes, leaveRes, sheetRes] = await Promise.all([
      supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('weekly_timesheets').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'under_review'])
    ]);

    setPendingCounts({
      expenses: expRes.count || 0,
      leaves: leaveRes.count || 0,
      timesheets: sheetRes.count || 0
    });
  }

  useEffect(() => {
    if (!user || profile?.role !== 'admin') return;
    void fetchCounts();

    const channel = supabase.channel('admin-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_timesheets' }, fetchCounts)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, profile?.role]);

  const total = pendingCounts.expenses + pendingCounts.leaves + pendingCounts.timesheets;

  const value = useMemo(() => ({ pendingCounts, total }), [pendingCounts, total]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
