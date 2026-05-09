import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import PageLoader from '../components/PageLoader';
import AdminOverview from './AdminOverview';
import AuditLogsViewer from '../components/AuditLogsViewer';
import { categoryShareRows, formatExpenseCategoryList } from '../lib/expenseCategories';
import { buildRangeSummary } from '../lib/reporting';
import {
  normalizeStatusHistory,
  formatHistoryDate,
  isMissingSchemaTable,
  getHoursSince,
  slugify,
  normalizeConflictFlags,
  formatSlaDuration
} from '../lib/adminHelpers';
import { exportReportAsPdfAndUpload, exportReportAsXlsxAndUpload } from '../lib/export';
import { supabase } from '../lib/supabaseClient';
import { calculateDurationHours, toDateKey } from '../lib/time';

const PIE_COLORS = ['#04AA6D', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];
const CUSTOM_PROJECTS_KEY = 'vseek_custom_projects';

function loadCustomProjects() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PROJECTS_KEY) || '[]'); } catch { return []; }
}

function removeCustomProject(name) {
  const existing = loadCustomProjects();
  const filtered = existing.filter((p) => p !== name);
  localStorage.setItem(CUSTOM_PROJECTS_KEY, JSON.stringify(filtered));
}

function inCurrentWeek(dateStr) {
  const now = new Date();
  const first = new Date(now);
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  first.setDate(diff);
  first.setHours(0, 0, 0, 0);
  const end = new Date(first);
  end.setDate(first.getDate() + 7);
  const date = new Date(dateStr);
  return date >= first && date < end;
}

function monthName(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', { month: 'long' });
}

function toInputDate(dateValue) {
  return toDateKey(dateValue instanceof Date ? dateValue : new Date(dateValue));
}

function leaveDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const a = new Date(`${startDate}T00:00:00`);
  const b = new Date(`${endDate}T00:00:00`);
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

function collectApprovedDaysFromSheet(sheet) {
  const approvedDays = new Set();
  const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  if (!sheet?.week_start || !Array.isArray(sheet.rows)) return [];

  dayKeys.forEach((dayKey, index) => {
    const date = new Date(`${sheet.week_start}T00:00:00`);
    date.setDate(date.getDate() + index);
    const dateKey = toInputDate(date);
    const hasHours = sheet.rows.some((row) => Number(row?.[dayKey] || 0) > 0);
    if (hasHours) approvedDays.add(dateKey);
  });

  return Array.from(approvedDays);
}

function getDepartmentFromOnboarding(onboardingRow) {
  const hrManaged = onboardingRow?.hr_managed_data || {};
  const editable = onboardingRow?.employee_editable_data || {};
  return String(hrManaged.department || editable.department || '').trim();
}

export default function AdminPage() {
  const { user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectAssignments, setProjectAssignments] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [timeline, setTimeline] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [weeklySheets, setWeeklySheets] = useState([]);
  const [reimbursements, setReimbursements] = useState([]);
  const [expenseStatusFilter, setExpenseStatusFilter] = useState('all');
  const [timesheetStatusFilter, setTimesheetStatusFilter] = useState('all');
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
  const [historyPreview, setHistoryPreview] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [reimbursementAction, setReimbursementAction] = useState(null);
  const [reimbursementForm, setReimbursementForm] = useState({ payment_mode: 'bank_transfer', transaction_reference: '' });
  const [expenseAction, setExpenseAction] = useState(null);
  const [expenseActionForm, setExpenseActionForm] = useState({ action: 'approve', comment: '' });
  const [timesheetAction, setTimesheetAction] = useState(null);
  const [timesheetActionForm, setTimesheetActionForm] = useState({ action: 'approve', comment: '' });
  const [leaveAction, setLeaveAction] = useState(null);
  const [leaveActionForm, setLeaveActionForm] = useState({ action: 'approve', comment: '' });
  const [unrecognizedProjects, setUnrecognizedProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState('timesheet');
  const [rangeStart, setRangeStart] = useState(() => {
    const today = new Date();
    return toInputDate(new Date(today.getFullYear(), today.getMonth(), 1));
  });
  const [rangeEnd, setRangeEnd] = useState(() => toInputDate(new Date()));

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab) return;

    const allowedTabs = new Set(['overview', 'timesheet', 'leave', 'expenses', 'audit_logs']);
    if (allowedTabs.has(tab)) {
      setAdminTab(tab);
    }
  }, [searchParams]);

  async function loadEmployees() {
    const [profilesRes, onboardingRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, role, created_at')
        .eq('role', 'employee')
        .order('name', { ascending: true }),
      supabase
        .from('employee_onboarding')
        .select('user_id, hr_managed_data, employee_editable_data')
    ]);

    if (profilesRes.error) {
      toast.error(profilesRes.error.message);
      return [];
    }

    if (onboardingRes.error && !isMissingSchemaTable(onboardingRes.error, 'public.employee_onboarding')) {
      toast.error(onboardingRes.error.message);
      return [];
    }

    const onboardingByUserId = new Map((onboardingRes.data || []).map((row) => [row.user_id, row]));

    return (profilesRes.data || []).map((employee) => {
      const onboarding = onboardingByUserId.get(employee.id);
      return {
        ...employee,
        department: getDepartmentFromOnboarding(onboarding)
      };
    });
  }

  async function loadEmployeeData(employeeId) {
    // Calculate year-long range for expenses
    const now = new Date();
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const expenseRangeStart = toInputDate(yearAgo);
    const expenseRangeEnd = toInputDate(now);

    const [timelineRes, expenseRes, leaveRes, weeklyRes, reimbursementRes] = await Promise.all([
      supabase
        .from('timeline_entries')
        .select('*')
        .eq('user_id', employeeId)
        .gte('date', rangeStart)
        .lte('date', rangeEnd)
        .order('date', { ascending: false }),
      supabase
        .from('expenses')
        .select('*')
        .eq('user_id', employeeId)
        .gte('date', expenseRangeStart)
        .lte('date', expenseRangeEnd)
        .order('date', { ascending: false }),
      supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', employeeId)
        .order('start_date', { ascending: false })
        .limit(100),
      supabase
        .from('weekly_timesheets')
        .select('*')
        .eq('user_id', employeeId)
        .order('week_start', { ascending: false })
        .limit(52),
      supabase
        .from('reimbursement_ledger')
        .select('*')
        .eq('user_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(100)
    ]);

    if (timelineRes.error) {
      toast.error(timelineRes.error.message);
      return;
    }

    if (expenseRes.error) {
      toast.error(expenseRes.error.message);
      return;
    }

    if (leaveRes.error) {
      if (!isMissingSchemaTable(leaveRes.error, 'public.leave_requests')) {
        toast.error(leaveRes.error.message);
        return;
      }
    }

    if (weeklyRes.error) {
      toast.error(weeklyRes.error.message);
      return;
    }

    if (reimbursementRes.error) {
      if (!isMissingSchemaTable(reimbursementRes.error, 'public.reimbursement_ledger')) {
        toast.error(reimbursementRes.error.message);
        return;
      }
    }

    setTimeline(timelineRes.data || []);
    setExpenses(expenseRes.data || []);
    setLeaveRequests(leaveRes.error ? [] : (leaveRes.data || []));
    setWeeklySheets(weeklyRes.data || []);
    setReimbursements(reimbursementRes.error ? [] : (reimbursementRes.data || []));
  }

  async function loadProjectData() {
    const [projectRes, assignmentRes] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, is_active, created_at')
        .order('name', { ascending: true }),
      supabase
        .from('employee_project_assignments')
        .select('user_id, project_id, created_at')
    ]);

    if (projectRes.error) {
      toast.error(projectRes.error.message);
      return;
    }

    if (assignmentRes.error) {
      toast.error(assignmentRes.error.message);
      return;
    }

    setProjects(projectRes.data || []);
    setProjectAssignments(assignmentRes.data || []);

    const customProjects = loadCustomProjects();
    const officialProjectNames = new Set((projectRes.data || []).map((p) => p.name));
    const unrecognized = customProjects.filter((name) => !officialProjectNames.has(name));
    setUnrecognizedProjects(unrecognized);
  }

  async function promoteProjectToOfficial(projectName) {
    const name = String(projectName || '').trim();
    if (!name) {
      toast.error('Project name is required');
      return;
    }

    const { error } = await supabase
      .from('projects')
      .insert({ name, is_active: true, created_by: user?.id || null });

    if (error) {
      toast.error(error.message);
      return;
    }

    removeCustomProject(projectName);
    toast.success(`"${projectName}" promoted to official project`);
    await loadProjectData();
  }

  async function addProject() {
    const name = String(newProjectName || '').trim();
    if (!name) {
      toast.error('Project name is required');
      return;
    }

    const { error } = await supabase
      .from('projects')
      .insert({ name, is_active: true, created_by: user?.id || null });

    if (error) {
      toast.error(error.message);
      return;
    }

    setNewProjectName('');
    toast.success('Project added');
    await loadProjectData();
  }

  async function deleteProject(project) {
    const ok = window.confirm(`Delete project "${project.name}" permanently? This cannot be undone.`);
    if (!ok) return;
    const { error } = await supabase.from('projects').delete().eq('id', project.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Project deleted');
    await loadProjectData();
  }

  async function toggleProjectActive(project) {
    const { error } = await supabase
      .from('projects')
      .update({ is_active: !project.is_active })
      .eq('id', project.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(project.is_active ? 'Project archived' : 'Project activated');
    await loadProjectData();
  }

  async function saveProjectAssignments() {
    if (!selectedEmployeeId) return;

    const existingIds = new Set(
      projectAssignments
        .filter((item) => item.user_id === selectedEmployeeId)
        .map((item) => item.project_id)
    );

    const nextIds = new Set(selectedProjectIds);
    const toInsert = [...nextIds].filter((projectId) => !existingIds.has(projectId));
    const toDelete = [...existingIds].filter((projectId) => !nextIds.has(projectId));

    if (toInsert.length) {
      const rows = toInsert.map((projectId) => ({
        user_id: selectedEmployeeId,
        project_id: projectId,
        assigned_by: user?.id || null
      }));
      const { error } = await supabase
        .from('employee_project_assignments')
        .insert(rows);
      if (error) {
        toast.error(error.message);
        return;
      }
    }

    if (toDelete.length) {
      const { error } = await supabase
        .from('employee_project_assignments')
        .delete()
        .eq('user_id', selectedEmployeeId)
        .in('project_id', toDelete);
      if (error) {
        toast.error(error.message);
        return;
      }
    }

    toast.success('Project assignments updated');
    await loadProjectData();
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoading(true);
      const [employeeList] = await Promise.all([loadEmployees(), loadProjectData()]);
      if (!mounted) return;
      setEmployees(employeeList);
      const firstEmployeeId = employeeList[0]?.id || '';
      setSelectedEmployeeId(firstEmployeeId);
      if (firstEmployeeId) {
        await loadEmployeeData(firstEmployeeId);
      } else {
        setTimeline([]);
        setExpenses([]);
        setLeaveRequests([]);
        setWeeklySheets([]);
        setReimbursements([]);
      }
      setLoading(false);
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) return;
    loadEmployeeData(selectedEmployeeId);
  }, [selectedEmployeeId]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setSelectedProjectIds([]);
      return;
    }
    setSelectedProjectIds(
      projectAssignments
        .filter((item) => item.user_id === selectedEmployeeId)
        .map((item) => item.project_id)
    );
  }, [selectedEmployeeId, projectAssignments]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId),
    [employees, selectedEmployeeId]
  );

  const departmentOptions = useMemo(
    () => [...new Set(employees.map((employee) => employee.department).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [employees]
  );

  const visibleEmployees = useMemo(
    () => departmentFilter === 'all'
      ? employees
      : employees.filter((employee) => employee.department === departmentFilter),
    [employees, departmentFilter]
  );

  useEffect(() => {
    if (!visibleEmployees.length) {
      setSelectedEmployeeId('');
      return;
    }

    if (!visibleEmployees.some((employee) => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(visibleEmployees[0].id);
    }
  }, [visibleEmployees, selectedEmployeeId]);

  const employeeNameById = useMemo(() => {
    const map = new Map();
    employees.forEach((employee) => {
      map.set(employee.id, employee.name);
    });
    return map;
  }, [employees]);

  const activeProjects = useMemo(
    () => projects.filter((project) => project.is_active),
    [projects]
  );

  const projectEmployeeMatrix = useMemo(() => {
    const grouped = new Map();

    projects.forEach((project) => {
      grouped.set(project.id, { project, employees: [] });
    });

    projectAssignments.forEach((assignment) => {
      const target = grouped.get(assignment.project_id);
      if (!target) return;
      const employeeName = employeeNameById.get(assignment.user_id);
      if (employeeName) target.employees.push(employeeName);
    });

    return Array.from(grouped.values())
      .map((row) => ({ ...row, employees: row.employees.sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => a.project.name.localeCompare(b.project.name));
  }, [projects, projectAssignments, employeeNameById]);

  const summary = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const weekStartKey = toInputDate(monday);
    const weekEndKey = toInputDate(now);
    const monthStartKey = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEndKey = toInputDate(now);

    const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    let weeklyHours = 0;
    let monthlyHours = 0;

    weeklySheets.forEach((sheet) => {
      if (!sheet.week_start || !Array.isArray(sheet.rows)) return;
      DAY_KEYS.forEach((dayKey, idx) => {
        const date = new Date(`${sheet.week_start}T00:00:00`);
        date.setDate(date.getDate() + idx);
        const dateKey = toInputDate(date);
        const dayHours = sheet.rows.reduce((sum, row) => sum + Number(row[dayKey] || 0), 0);
        if (dayHours <= 0) return;
        if (dateKey >= weekStartKey && dateKey <= weekEndKey) weeklyHours += dayHours;
        if (dateKey >= monthStartKey && dateKey <= monthEndKey) monthlyHours += dayHours;
      });
    });

    const weeklyExpenses = expenses.filter((entry) => entry.status === 'approved' && entry.date >= weekStartKey && entry.date <= weekEndKey);
    const monthlyExpenses = expenses.filter((entry) => entry.status === 'approved' && entry.date >= monthStartKey && entry.date <= monthEndKey);

    const weeklyExpenseTotal = weeklyExpenses.reduce((sum, entry) => sum + Number(entry.amount), 0);
    const monthlyExpenseTotal = monthlyExpenses.reduce((sum, entry) => sum + Number(entry.amount), 0);

    const byCategory = monthlyExpenses.reduce((acc, entry) => {
      categoryShareRows(entry).forEach((row) => {
        acc[row.category] = (acc[row.category] || 0) + row.amount;
      });
      return acc;
    }, {});

    const categoryData = Object.entries(byCategory).map(([name, value]) => ({ name, value }));

    return {
      weeklyHours: weeklyHours.toFixed(2),
      weeklyExpenseTotal: weeklyExpenseTotal.toFixed(2),
      monthlyHours: monthlyHours.toFixed(2),
      monthlyExpenseTotal: monthlyExpenseTotal.toFixed(2),
      categoryData
    };
  }, [weeklySheets, expenses]);

  const filteredExpenses = useMemo(() => {
    if (expenseStatusFilter === 'all') return expenses;
    return expenses.filter((entry) => entry.status === expenseStatusFilter);
  }, [expenses, expenseStatusFilter]);

  const filteredWeeklySheets = useMemo(() => {
    if (timesheetStatusFilter === 'all') return weeklySheets;
    return weeklySheets.filter((s) => s.status === timesheetStatusFilter);
  }, [weeklySheets, timesheetStatusFilter]);

  const filteredLeaveRequests = useMemo(() => {
    if (leaveStatusFilter === 'all') return leaveRequests;
    return leaveRequests.filter((r) => r.status === leaveStatusFilter);
  }, [leaveRequests, leaveStatusFilter]);

  const expenseStatusCounts = useMemo(
    () => ({
      all: expenses.length,
      pending: expenses.filter((entry) => entry.status === 'pending').length,
      approved: expenses.filter((entry) => entry.status === 'approved').length,
      rejected: expenses.filter((entry) => entry.status === 'rejected').length
    }),
    [expenses]
  );

  const perMonthHours = useMemo(() => {
    const monthMap = timeline.reduce((acc, entry) => {
      const month = monthName(entry.date);
      acc[month] = (acc[month] || 0) + Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time));
      return acc;
    }, {});

    return Object.entries(monthMap).map(([month, hours]) => ({ month, hours: Number(hours.toFixed(2)) }));
  }, [timeline]);

  const rangeSummary = useMemo(
    () => buildRangeSummary(timeline, expenses, rangeStart, rangeEnd),
    [timeline, expenses, rangeStart, rangeEnd]
  );

  const pendingApprovals = useMemo(() => {
    const expenseItems = expenses
      .filter((entry) => entry.status === 'pending')
      .map((entry) => ({
        id: entry.id,
        kind: 'expense',
        label: `Expense ${entry.date} · ₹${Number(entry.amount || 0).toFixed(2)}`,
        sinceAt: entry.created_at,
        lastReminderAt: entry.last_reminder_at,
        escalatedAt: entry.escalated_at,
        meta: entry
      }));

    const leaveItems = leaveRequests
      .filter((entry) => entry.status === 'pending')
      .map((entry) => ({
        id: entry.id,
        kind: 'leave',
        label: `Leave ${entry.start_date} to ${entry.end_date}`,
        sinceAt: entry.submitted_at || entry.created_at,
        lastReminderAt: entry.last_reminder_at,
        escalatedAt: entry.escalated_at,
        meta: entry
      }));

    const timesheetItems = weeklySheets
      .filter((entry) => ['submitted', 'under_review'].includes(entry.status))
      .map((entry) => ({
        id: entry.id,
        kind: 'timesheet',
        label: `Timesheet ${entry.week_start} to ${entry.week_end}`,
        sinceAt: entry.submitted_at || entry.created_at,
        lastReminderAt: entry.last_reminder_at,
        escalatedAt: entry.escalated_at,
        meta: entry
      }));

    return [...expenseItems, ...leaveItems, ...timesheetItems]
      .map((item) => ({ ...item, pendingHours: getHoursSince(item.sinceAt) }))
      .sort((a, b) => b.pendingHours - a.pendingHours);
  }, [expenses, leaveRequests, weeklySheets]);

  const slaStats = useMemo(() => {
    const over24h = pendingApprovals.filter((item) => item.pendingHours > 24).length;
    const over3d = pendingApprovals.filter((item) => item.pendingHours > 72).length;
    return {
      totalPending: pendingApprovals.length,
      over24h,
      over3d
    };
  }, [pendingApprovals]);

  const resetRange = () => {
    const today = new Date();
    setRangeStart(toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)));
    setRangeEnd(toInputDate(new Date()));
  };

  const exportEmployeePdf = async () => {
    try {
      if (!selectedEmployeeId || !selectedEmployee || !user?.id) {
        toast.error('Select an employee first.');
        return;
      }

      const rows = [
        `Employee: ${selectedEmployee.name}`,
        `Date Range: ${rangeStart || '-'} to ${rangeEnd || '-'}`,
        `Total Working Hours: ${rangeSummary.totalHours}`,
        `Total Approved Expenses: INR ${rangeSummary.totalExpenses}`,
        '',
        'Approved Category Totals:',
        ...rangeSummary.categoryRows.map((row) => `  ${row.category}: INR ${row.amount}`),
        '',
        'Daily Totals:',
        ...rangeSummary.dailyRows.map((row) => `  ${row.date} | ${row.workingHours}h | INR ${row.expenses}`),
        '',
        'Timeline Entries:',
        ...rangeSummary.filteredTimeline.map(
          (entry) =>
            `  ${entry.date} | ${entry.start_time?.slice(0, 5) || '--:--'}-${entry.end_time?.slice(0, 5) || '--:--'} | ${Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time)).toFixed(2)}h | ${entry.type || ''} | ${entry.description || ''}`
        ),
        '',
        'Expense Entries:',
        ...rangeSummary.filteredExpenses.map(
          (entry) =>
            `  ${entry.date} | ${entry.expense_time?.slice(0, 5) || '--:--'} | ${formatExpenseCategoryList(entry)} | INR ${Number(entry.amount || 0).toFixed(2)} | ${entry.status || ''} | ${entry.notes || ''}`
        )
      ];

      const fileSlug = slugify(selectedEmployee.name || 'employee');
      const url = await exportReportAsPdfAndUpload({
        title: `${selectedEmployee.name} - Timeline and Expenses`,
        rows,
        fileName: `admin-${fileSlug}-report`,
        userId: user.id
      });

      window.open(url, '_blank', 'noopener,noreferrer');
      toast.success('Employee PDF generated.');
    } catch (error) {
      toast.error(error.message || 'Failed to export PDF');
    }
  };

  const exportEmployeeXlsx = async () => {
    try {
      if (!selectedEmployeeId || !selectedEmployee || !user?.id) {
        toast.error('Select an employee first.');
        return;
      }

      const summaryRows = [
        {
          section: 'Summary',
          employee: selectedEmployee.name,
          fromDate: rangeStart || '',
          toDate: rangeEnd || '',
          totalHours: Number(rangeSummary.totalHours),
          totalExpenses: Number(rangeSummary.totalExpenses)
        }
      ];

      const dailyRows = rangeSummary.dailyRows.map((row) => ({
        section: 'Daily Total',
        employee: selectedEmployee.name,
        date: row.date,
        workingHours: row.workingHours,
        expenses: row.expenses
      }));

      const categoryRows = rangeSummary.categoryRows.map((row) => ({
        section: 'Category Total',
        employee: selectedEmployee.name,
        category: row.category,
        amount: row.amount
      }));

      const timelineRows = rangeSummary.filteredTimeline.map((entry) => ({
        section: 'Timeline Entry',
        employee: selectedEmployee.name,
        date: entry.date,
        startTime: entry.start_time?.slice(0, 5) || '',
        endTime: entry.end_time?.slice(0, 5) || '',
        duration: Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time)).toFixed(2),
        type: entry.type || '',
        description: entry.description || ''
      }));

      const expenseRows = rangeSummary.filteredExpenses.map((entry) => ({
        section: 'Expense Entry',
        employee: selectedEmployee.name,
        date: entry.date,
        time: entry.expense_time?.slice(0, 5) || '',
        category: formatExpenseCategoryList(entry),
        amount: Number(entry.amount || 0).toFixed(2),
        status: entry.status || '',
        notes: entry.notes || ''
      }));

      const fileSlug = slugify(selectedEmployee.name || 'employee');
      const url = await exportReportAsXlsxAndUpload({
        sheetName: 'Employee Report',
        jsonData: [...summaryRows, ...dailyRows, ...categoryRows, ...timelineRows, ...expenseRows],
        fileName: `admin-${fileSlug}-report`,
        userId: user.id
      });

      window.open(url, '_blank', 'noopener,noreferrer');
      toast.success('Employee Excel generated.');
    } catch (error) {
      toast.error(error.message || 'Failed to export Excel');
    }
  };

  const updateSlaMarker = async (kind, id, field) => {
    const tableMap = {
      expense: 'expenses',
      leave: 'leave_requests',
      timesheet: 'weekly_timesheets'
    };

    const table = tableMap[kind];
    if (!table) return;

    const payload = { [field]: new Date().toISOString() };
    const { error } = await supabase
      .from(table)
      .update(payload)
      .eq('id', id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(field === 'last_reminder_at' ? 'Reminder marked' : 'Escalation marked');
    loadEmployeeData(selectedEmployeeId);
  };

  const markReimbursementPaid = async () => {
    if (!reimbursementAction) return;
    const { error } = await supabase
      .from('reimbursement_ledger')
      .update({
        payment_status: 'paid',
        paid_date: toInputDate(new Date()),
        payment_mode: reimbursementForm.payment_mode,
        transaction_reference: reimbursementForm.transaction_reference || null
      })
      .eq('id', reimbursementAction.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Reimbursement marked as paid');
    setReimbursementAction(null);
    setReimbursementForm({ payment_mode: 'bank_transfer', transaction_reference: '' });
    loadEmployeeData(selectedEmployeeId);
  };

  const deleteExpenseAsAdmin = async (entry) => {
    const ok = window.confirm('Warning: This expense will be permanently deleted and cannot be retrieved again. Do you want to continue?');
    if (!ok) return;

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', entry.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Expense deleted permanently');
    loadEmployeeData(selectedEmployeeId);
  };

  const updateExpenseStatus = async () => {
    if (!expenseAction) return;

    const { action, comment } = expenseActionForm;
    const newStatus = action === 'reject' ? 'rejected' : 'approved';
    const statusHistory = Array.isArray(expenseAction.status_history)
      ? [...expenseAction.status_history]
      : [];

    statusHistory.push({
      status: newStatus,
      changed_at: new Date().toISOString(),
      changed_by: user?.id,
      comment: comment || null
    });

    const { error } = await supabase
      .from('expenses')
      .update({
        status: newStatus,
        approval_comment: comment || null,
        status_history: statusHistory
      })
      .eq('id', expenseAction.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Expense ${newStatus}`);
    setExpenseAction(null);
    setExpenseActionForm({ action: 'approve', comment: '' });
    loadEmployeeData(selectedEmployeeId);
  };

  const deleteTimesheetAsAdmin = async (sheet) => {
    const ok = window.confirm('Warning: This weekly timesheet will be permanently deleted and cannot be retrieved again. Do you want to continue?');
    if (!ok) return;

    const { error } = await supabase
      .from('weekly_timesheets')
      .delete()
      .eq('id', sheet.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Weekly timesheet deleted permanently');
    loadEmployeeData(selectedEmployeeId);
  };

  const updateTimesheetStatus = async () => {
    if (!timesheetAction) return;
    
    const { action, comment } = timesheetActionForm;
    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      needs_changes: 'needs_changes',
      under_review: 'under_review',
      revoke: 'rejected'
    };
    const newStatus = statusMap[action] || action;

    const statusHistory = timesheetAction.status_history ? JSON.parse(JSON.stringify(timesheetAction.status_history)) : [];
    statusHistory.push({
      status: newStatus,
      changed_at: new Date().toISOString(),
      changed_by: user?.id,
      comment: comment || null
    });

    const { error } = await supabase
      .from('weekly_timesheets')
      .update({
        status: newStatus,
        approval_comment: comment || null,
        status_history: statusHistory,
        approved_days: newStatus === 'approved' ? collectApprovedDaysFromSheet(timesheetAction) : [],
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', timesheetAction.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Timesheet ${newStatus}`);
    setTimesheetAction(null);
    setTimesheetActionForm({ action: 'approve', comment: '' });
    loadEmployeeData(selectedEmployeeId);
  };

  const updateLeaveStatus = async () => {
    if (!leaveAction) return;
    const { action, comment } = leaveActionForm;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const nextHistory = [
      ...(Array.isArray(leaveAction.status_history) ? leaveAction.status_history : []),
      { status: newStatus, comment: comment || null, changed_at: new Date().toISOString(), changed_by: user?.id }
    ];
    const { error } = await supabase
      .from('leave_requests')
      .update({ status: newStatus, approval_comment: comment || null, status_history: nextHistory })
      .eq('id', leaveAction.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Leave request ${newStatus}`);
    setLeaveAction(null);
    setLeaveActionForm({ action: 'approve', comment: '' });
    loadEmployeeData(selectedEmployeeId);
  };

  if (loading) return <PageLoader message="Loading employee data…" />;

  if (!employees.length) {
    return <div className="card p-4 text-sm">No employees found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Hub</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Logged in as <span className="font-semibold text-ink dark:text-white">{profile?.name}</span> · Select an employee to view timelines, reports, expenses, and leave requests.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            className="rounded-full border border-[#dddddd] bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]"
          >
            <option value="all">All Departments</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>{department}</option>
            ))}
          </select>

          {visibleEmployees.map((employee) => (
            <button
              key={employee.id}
              type="button"
              onClick={() => setSelectedEmployeeId(employee.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                selectedEmployeeId === employee.id
                  ? 'border-teal bg-teal text-white shadow-sm'
                  : 'border-[#dddddd] bg-white text-slate-700 hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]'
              }`}
            >
              {employee.name}{employee.department ? ` · ${employee.department}` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'timesheet', label: 'Timesheet' },
          { key: 'leave', label: 'Leave' },
          { key: 'expenses', label: 'Expenses' },
          { key: 'audit_logs', label: 'Audit Logs' }
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setAdminTab(key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              adminTab === key
                ? 'border-teal bg-teal text-white'
                : 'border-[#dddddd] bg-white text-slate-700 hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {adminTab === 'overview' && (
        <AdminOverview
          selectedEmployee={selectedEmployee}
          activeProjects={activeProjects}
          selectedProjectIds={selectedProjectIds}
          setSelectedProjectIds={setSelectedProjectIds}
          saveProjectAssignments={saveProjectAssignments}
          summary={summary}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          setRangeStart={setRangeStart}
          setRangeEnd={setRangeEnd}
          resetRange={resetRange}
          exportEmployeePdf={exportEmployeePdf}
          exportEmployeeXlsx={exportEmployeeXlsx}
          rangeSummary={rangeSummary}
          reimbursements={reimbursements}
          setReimbursementAction={setReimbursementAction}
          setReimbursementForm={setReimbursementForm}
          reimbursementForm={reimbursementForm}
          weeklySheets={weeklySheets}
        />
      )}

      {adminTab === 'timesheet' && (
        <div className="space-y-4">
          <div className="card overflow-x-auto p-4 w-full">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-semibold">Weekly Timesheets for {selectedEmployee?.name}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'draft', label: 'Draft' },
                  { key: 'submitted', label: 'Submitted' },
                  { key: 'under_review', label: 'Under Review' },
                  { key: 'needs_changes', label: 'Needs Changes' },
                  { key: 'approved', label: 'Approved' },
                  { key: 'rejected', label: 'Rejected' }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTimesheetStatusFilter(item.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      timesheetStatusFilter === item.key
                        ? 'border-teal bg-teal text-white'
                        : 'border-[#dddddd] bg-white text-slate-700 hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 md:hidden">
              {filteredWeeklySheets.map((sheet) => (
                <div key={sheet.id} className="rounded-xl border border-[#dddddd] p-3 text-sm dark:border-[#444]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{sheet.week_start} to {sheet.week_end}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{Number(sheet.total_hours || 0).toFixed(2)}h</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold capitalize text-slate-700 dark:bg-slate-700 dark:text-slate-200">{sheet.status}</span>
                  </div>
                  {sheet.approval_comment ? <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{sheet.approval_comment}</p> : null}
                  {normalizeConflictFlags(sheet.conflict_flags).length ? (
                    <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-300">Conflicts: {normalizeConflictFlags(sheet.conflict_flags).join(', ')}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(sheet)}>History</button>
                    <button type="button" className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300" onClick={() => { setTimesheetAction(sheet); setTimesheetActionForm({ action: 'approve', comment: '' }); }}>Approve</button>
                    <button type="button" className="rounded-md border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600 transition hover:bg-orange-100 dark:border-orange-900/40 dark:bg-orange-900/20 dark:text-orange-300" onClick={() => { setTimesheetAction(sheet); setTimesheetActionForm({ action: 'needs_changes', comment: '' }); }}>Changes</button>
                    <button type="button" className="rounded-md border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600 transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300" onClick={() => { setTimesheetAction(sheet); setTimesheetActionForm({ action: 'revoke', comment: '' }); }}>Revoke</button>
                    <button type="button" className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => { setTimesheetAction(sheet); setTimesheetActionForm({ action: 'reject', comment: '' }); }}>Reject</button>
                  </div>
                </div>
              ))}
              {!filteredWeeklySheets.length ? <p className="text-sm text-slate-500">No weekly timesheets match the selected filter.</p> : null}
            </div>

            <table className="hidden w-full min-w-[1100px] text-sm md:table">
              <thead>
                <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                  <th className="py-2">Week</th>
                  <th>Status</th>
                  <th>Total Hours</th>
                  <th>Submitted At</th>
                  <th>Reviewed At</th>
                  <th>Comment</th>
                  <th>Conflicts</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWeeklySheets.map((sheet) => (
                  <tr key={sheet.id} className="border-b border-[#f1f1f1] dark:border-[#444]">
                    <td className="py-2">{sheet.week_start} to {sheet.week_end}</td>
                    <td className="capitalize">{sheet.status}</td>
                    <td>{Number(sheet.total_hours || 0).toFixed(2)}h</td>
                    <td>{sheet.submitted_at ? new Date(sheet.submitted_at).toLocaleString() : '—'}</td>
                    <td>{sheet.reviewed_at ? new Date(sheet.reviewed_at).toLocaleString() : '—'}</td>
                    <td className="max-w-[220px] truncate">{sheet.approval_comment || '—'}</td>
                    <td>
                      {normalizeConflictFlags(sheet.conflict_flags).length ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                          {normalizeConflictFlags(sheet.conflict_flags).join(', ')}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(sheet)}>History</button>
                        <button type="button" className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300" onClick={() => { setTimesheetAction(sheet); setTimesheetActionForm({ action: 'approve', comment: '' }); }}>Approve</button>
                        <button type="button" className="rounded-md border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600 transition hover:bg-orange-100 dark:border-orange-900/40 dark:bg-orange-900/20 dark:text-orange-300" onClick={() => { setTimesheetAction(sheet); setTimesheetActionForm({ action: 'needs_changes', comment: '' }); }}>Changes</button>
                        <button type="button" className="rounded-md border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600 transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300" onClick={() => { setTimesheetAction(sheet); setTimesheetActionForm({ action: 'revoke', comment: '' }); }}>Revoke</button>
                        <button type="button" className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => { setTimesheetAction(sheet); setTimesheetActionForm({ action: 'reject', comment: '' }); }}>Reject</button>
                        <button type="button" className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => deleteTimesheetAsAdmin(sheet)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredWeeklySheets.length ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={9}>No weekly timesheets match the selected filter.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adminTab === 'leave' ? (
        <div className="card overflow-x-auto p-4 w-full">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold">Leave Requests for {selectedEmployee?.name}</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'all', label: 'All' },
                { key: 'pending', label: 'Pending' },
                { key: 'approved', label: 'Approved' },
                { key: 'rejected', label: 'Rejected' },
                { key: 'cancelled', label: 'Cancelled' }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setLeaveStatusFilter(item.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    leaveStatusFilter === item.key
                      ? 'border-teal bg-teal text-white'
                      : 'border-[#dddddd] bg-white text-slate-700 hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {filteredLeaveRequests.map((request) => (
              <div key={request.id} className="rounded-xl border border-[#dddddd] p-3 text-sm dark:border-[#444]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{request.leave_type}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{request.start_date} to {request.end_date}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold capitalize text-slate-700 dark:bg-slate-700 dark:text-slate-200">{request.status}</span>
                </div>
                <p className="mt-2 font-semibold">{request.subject}</p>
                {request.content ? <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{request.content}</p> : null}
                {request.approval_comment ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Comment: {request.approval_comment}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(request)}>History</button>
                  <button type="button" className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300" onClick={() => { setLeaveAction(request); setLeaveActionForm({ action: 'approve', comment: '' }); }} disabled={request.status !== 'pending'}>Approve</button>
                  <button type="button" className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => { setLeaveAction(request); setLeaveActionForm({ action: 'reject', comment: '' }); }} disabled={request.status !== 'pending'}>Reject</button>
                </div>
              </div>
            ))}
            {!filteredLeaveRequests.length ? <p className="text-sm text-slate-500">No leave requests match the selected filter.</p> : null}
          </div>

          <table className="hidden w-full min-w-[1100px] text-sm md:table">
            <thead>
              <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                <th className="py-2">Type</th>
                <th>Period</th>
                <th>Days</th>
                <th>Subject</th>
                <th>Content</th>
                <th>Status</th>
                <th>Submitted At</th>
                <th>Comment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeaveRequests.map((request) => (
                <tr key={request.id} className="border-b border-[#f1f1f1] dark:border-[#444]">
                  <td className="py-2">{request.leave_type}</td>
                  <td>{request.start_date} to {request.end_date}</td>
                  <td className="font-semibold">{leaveDays(request.start_date, request.end_date)}d</td>
                  <td className="max-w-[180px] truncate">{request.subject}</td>
                  <td className="max-w-[220px] truncate">{request.content}</td>
                  <td className="capitalize">{request.status}</td>
                  <td>{request.submitted_at ? new Date(request.submitted_at).toLocaleString() : '—'}</td>
                  <td className="max-w-[180px] truncate">{request.approval_comment || '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(request)}>History</button>
                      <button type="button" className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300" onClick={() => { setLeaveAction(request); setLeaveActionForm({ action: 'approve', comment: '' }); }} disabled={request.status !== 'pending'}>Approve</button>
                      <button type="button" className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => { setLeaveAction(request); setLeaveActionForm({ action: 'reject', comment: '' }); }} disabled={request.status !== 'pending'}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredLeaveRequests.length ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={9}>No leave requests match the selected filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {adminTab === 'expenses' ? (
        <div className="space-y-4">
          <div className="card overflow-x-auto p-4 w-full">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-semibold">Expenses for {selectedEmployee?.name}</h2>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: `All (${expenseStatusCounts.all})` },
                  { key: 'pending', label: `Pending (${expenseStatusCounts.pending})` },
                  { key: 'approved', label: `Approved (${expenseStatusCounts.approved})` },
                  { key: 'rejected', label: `Rejected (${expenseStatusCounts.rejected})` }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setExpenseStatusFilter(item.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      expenseStatusFilter === item.key
                        ? 'border-teal bg-teal text-white'
                        : 'border-[#dddddd] bg-white text-slate-700 hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[#dddddd] p-3 dark:border-[#444]">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending Approvals</p>
                <p className="mt-1 text-xl font-bold">{slaStats.totalPending}</p>
              </div>
              <div className="rounded-xl border border-[#dddddd] p-3 dark:border-[#444]">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending {'>'} 24h</p>
                <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-300">{slaStats.over24h}</p>
              </div>
              <div className="rounded-xl border border-[#dddddd] p-3 dark:border-[#444]">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending {'>'} 3 days</p>
                <p className="mt-1 text-xl font-bold text-red-600 dark:text-red-300">{slaStats.over3d}</p>
              </div>
            </div>

            <div className="mb-4 overflow-x-auto rounded-xl border border-[#dddddd] dark:border-[#444]">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                    <th className="py-2 px-3">Request</th>
                    <th>Type</th>
                    <th>Pending Since</th>
                    <th>Elapsed</th>
                    <th>Last Reminder</th>
                    <th>Escalated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.slice(0, 8).map((item) => (
                    <tr key={`${item.kind}-${item.id}`} className="border-b border-[#f1f1f1] dark:border-[#444]">
                      <td className="py-2 px-3">{item.label}</td>
                      <td className="capitalize">{item.kind}</td>
                      <td>{item.sinceAt ? new Date(item.sinceAt).toLocaleString() : '-'}</td>
                      <td className={item.pendingHours > 72 ? 'font-semibold text-red-600 dark:text-red-300' : item.pendingHours > 24 ? 'font-semibold text-amber-600 dark:text-amber-300' : ''}>
                        {formatSlaDuration(item.pendingHours)}
                      </td>
                      <td>{item.lastReminderAt ? new Date(item.lastReminderAt).toLocaleString() : '-'}</td>
                      <td>{item.escalatedAt ? new Date(item.escalatedAt).toLocaleString() : '-'}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => updateSlaMarker(item.kind, item.id, 'last_reminder_at')}>Remind</button>
                          <button type="button" className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => updateSlaMarker(item.kind, item.id, 'escalated_at')}>Escalate</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!pendingApprovals.length ? (
                    <tr>
                      <td className="py-3 px-3 text-slate-500" colSpan={7}>No pending approvals for SLA tracking.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {filteredExpenses.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-[#dddddd] p-3 text-sm dark:border-[#444]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{entry.date} {entry.expense_time?.slice(0, 5) || '—'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{entry.project || '-'} · {formatExpenseCategoryList(entry)}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold capitalize text-slate-700 dark:bg-slate-700 dark:text-slate-200">{entry.status}</span>
                  </div>
                  <p className="mt-2 font-semibold">₹{Number(entry.amount).toFixed(2)}</p>
                  {entry.approval_comment ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.approval_comment}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(entry)}>History</button>
                    <button type="button" className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300" onClick={() => { setExpenseAction(entry); setExpenseActionForm({ action: 'approve', comment: '' }); }} disabled={entry.status !== 'pending'}>Approve</button>
                    <button type="button" className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => { setExpenseAction(entry); setExpenseActionForm({ action: 'reject', comment: '' }); }} disabled={entry.status !== 'pending'}>Reject</button>
                    <button type="button" className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => deleteExpenseAsAdmin(entry)}>Delete</button>
                  </div>
                </div>
              ))}
              {!filteredExpenses.length ? <p className="text-sm text-slate-500">No expenses for this employee.</p> : null}
            </div>

            <table className="hidden w-full min-w-[1120px] text-sm md:table">
              <thead>
                <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                  <th className="py-2">Date</th>
                  <th>Time</th>
                  <th>Project</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Conflicts</th>
                  <th>Receipt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((entry) => (
                  <tr key={entry.id} className="border-b border-[#f1f1f1] dark:border-[#444]">
                    <td className="py-2">{entry.date}</td>
                    <td>{entry.expense_time?.slice(0, 5) || '—'}</td>
                    <td>{entry.project || '-'}</td>
                    <td>{formatExpenseCategoryList(entry)}</td>
                    <td>₹{Number(entry.amount).toFixed(2)}</td>
                    <td className="capitalize">
                      {entry.status}
                      {entry.approval_comment ? <p className="mt-1 max-w-[180px] truncate text-[11px] text-slate-500 dark:text-slate-400">{entry.approval_comment}</p> : null}
                    </td>
                    <td>{entry.notes || '—'}</td>
                    <td>
                      {normalizeConflictFlags(entry.conflict_flags).length ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                          {normalizeConflictFlags(entry.conflict_flags).join(', ')}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {entry.receipt_url ? (
                        <button
                          type="button"
                          onClick={() => setReceiptPreview({
                            url: entry.receipt_url,
                            title: `${selectedEmployee?.name || 'Employee'} - ${formatExpenseCategoryList(entry)} - ${entry.date}`
                          })}
                          className="inline-flex items-center gap-1 rounded-lg bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal hover:bg-teal/20 transition dark:bg-teal/20 dark:text-teal-300"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          View
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(entry)}>History</button>
                        <button type="button" className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300" onClick={() => { setExpenseAction(entry); setExpenseActionForm({ action: 'approve', comment: '' }); }} disabled={entry.status !== 'pending'}>Approve</button>
                        <button type="button" className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => { setExpenseAction(entry); setExpenseActionForm({ action: 'reject', comment: '' }); }} disabled={entry.status !== 'pending'}>Reject</button>
                        <button type="button" className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => deleteExpenseAsAdmin(entry)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredExpenses.length ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={10}>No expenses for this employee.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {adminTab === 'audit_logs' ? (
        <div className="card p-4 w-full">
          <AuditLogsViewer />
        </div>
      ) : null}

      <Modal
        title={historyPreview
          ? historyPreview.week_start
            ? `Status History - Week ${historyPreview.week_start}`
            : historyPreview.leave_type
              ? `Status History - ${historyPreview.subject || 'Leave Request'}`
            : `Status History - ${historyPreview.category}`
          : 'Status History'}
        open={Boolean(historyPreview)}
        onClose={() => setHistoryPreview(null)}
      >
        {historyPreview ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              {historyPreview.week_start ? (
                <>
                  <p><span className="font-semibold">Week:</span> {historyPreview.week_start} to {historyPreview.week_end}</p>
                  <p><span className="font-semibold">Hours:</span> {Number(historyPreview.total_hours || 0).toFixed(2)}h</p>
                  <p><span className="font-semibold">Status:</span> {historyPreview.status || '-'}</p>
                </>
              ) : historyPreview.leave_type ? (
                <>
                  <p><span className="font-semibold">Type:</span> {historyPreview.leave_type || '-'}</p>
                  <p><span className="font-semibold">Period:</span> {historyPreview.start_date} to {historyPreview.end_date}</p>
                  <p><span className="font-semibold">Subject:</span> {historyPreview.subject || '-'}</p>
                  <p><span className="font-semibold">Status:</span> {historyPreview.status || '-'}</p>
                </>
              ) : (
                <>
                  <p><span className="font-semibold">Date:</span> {historyPreview.date}</p>
                  <p><span className="font-semibold">Project:</span> {historyPreview.project || '-'}</p>
                  <p><span className="font-semibold">Amount:</span> ₹{Number(historyPreview.amount || 0).toFixed(2)}</p>
                </>
              )}
            </div>

            {normalizeStatusHistory(historyPreview.status_history).length ? (
              <ul className="space-y-2">
                {normalizeStatusHistory(historyPreview.status_history).map((event, index) => (
                  <li key={`${event.changed_at || index}-${event.status || 'status'}`} className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
                    <p className="font-semibold capitalize">{event.status || '-'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatHistoryDate(event.changed_at)}</p>
                    {event.comment ? <p className="mt-1 text-slate-600 dark:text-slate-300">{event.comment}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No status history yet.</p>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        title={`Leave Review - ${leaveAction?.subject || 'Leave Request'}`}
        open={Boolean(leaveAction)}
        onClose={() => { setLeaveAction(null); setLeaveActionForm({ action: 'approve', comment: '' }); }}
      >
        {leaveAction ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              <p><span className="font-semibold">Type:</span> {leaveAction.leave_type}</p>
              <p><span className="font-semibold">Period:</span> {leaveAction.start_date} to {leaveAction.end_date} ({leaveDays(leaveAction.start_date, leaveAction.end_date)} days)</p>
              <p><span className="font-semibold">Subject:</span> {leaveAction.subject}</p>
              {leaveAction.content ? <p><span className="font-semibold">Content:</span> {leaveAction.content}</p> : null}
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Action</label>
              <select value={leaveActionForm.action} onChange={(e) => setLeaveActionForm({ ...leaveActionForm, action: e.target.value })} className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]">
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Comment (optional)</label>
              <textarea value={leaveActionForm.comment} onChange={(e) => setLeaveActionForm({ ...leaveActionForm, comment: e.target.value })} rows={3} placeholder={leaveActionForm.action === 'reject' ? 'Reason for rejection...' : 'Approval notes (optional)...'} className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setLeaveAction(null); setLeaveActionForm({ action: 'approve', comment: '' }); }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={updateLeaveStatus}>Submit Review</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={`Expense Review - ${expenseAction?.date || 'Expense'}`}
        open={Boolean(expenseAction)}
        onClose={() => { setExpenseAction(null); setExpenseActionForm({ action: 'approve', comment: '' }); }}
      >
        {expenseAction ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              <p><span className="font-semibold">Date:</span> {expenseAction.date}</p>
              <p><span className="font-semibold">Time:</span> {expenseAction.expense_time?.slice(0, 5) || '—'}</p>
              <p><span className="font-semibold">Project:</span> {expenseAction.project || '-'}</p>
              <p><span className="font-semibold">Category:</span> {formatExpenseCategoryList(expenseAction)}</p>
              <p><span className="font-semibold">Amount:</span> ₹{Number(expenseAction.amount || 0).toFixed(2)}</p>
              <p><span className="font-semibold">Current Status:</span> {expenseAction.status || '-'}</p>
              {expenseAction.notes ? <p><span className="font-semibold">Notes:</span> {expenseAction.notes}</p> : null}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Action</label>
              <select value={expenseActionForm.action} onChange={(e) => setExpenseActionForm({ ...expenseActionForm, action: e.target.value })} className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]">
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Comment (optional)</label>
              <textarea value={expenseActionForm.comment} onChange={(e) => setExpenseActionForm({ ...expenseActionForm, comment: e.target.value })} rows={3} placeholder={expenseActionForm.action === 'reject' ? 'Reason for rejection...' : 'Approval notes (optional)...'} className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]" />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setExpenseAction(null); setExpenseActionForm({ action: 'approve', comment: '' }); }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={updateExpenseStatus}>Submit Review</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(receiptPreview)}
        onClose={() => setReceiptPreview(null)}
      >
        {receiptPreview?.url ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-[#dddddd] dark:border-[#444]">
              <img src={receiptPreview.url} alt={receiptPreview.title || 'Receipt'} className="w-full object-contain" />
            </div>
            <a href={receiptPreview.url} target="_blank" rel="noreferrer" className="btn-primary inline-flex">
              Open Full Receipt
            </a>
          </div>
        ) : null}
      </Modal>

      <Modal
        title="Mark Reimbursement as Paid"
        open={Boolean(reimbursementAction)}
        onClose={() => { setReimbursementAction(null); setReimbursementForm({ payment_mode: 'bank_transfer', transaction_reference: '' }); }}
      >
        {reimbursementAction ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              <p><span className="font-semibold">Expense ID:</span> {reimbursementAction.expense_id}</p>
              <p><span className="font-semibold">Amount:</span> ₹{Number(reimbursementAction.approved_amount || 0).toFixed(2)}</p>
              <p><span className="font-semibold">Due Date:</span> {reimbursementAction.due_date || '—'}</p>
              <p><span className="font-semibold">Current Status:</span> {reimbursementAction.payment_status || 'pending'}</p>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Payment Mode
              </label>
              <select
                value={reimbursementForm.payment_mode}
                onChange={(e) => setReimbursementForm({ ...reimbursementForm, payment_mode: e.target.value })}
                className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Transaction Reference (optional)
              </label>
              <input
                type="text"
                value={reimbursementForm.transaction_reference}
                onChange={(e) => setReimbursementForm({ ...reimbursementForm, transaction_reference: e.target.value })}
                placeholder="UTR / Check number / Reference ID"
                className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setReimbursementAction(null); setReimbursementForm({ payment_mode: 'bank_transfer', transaction_reference: '' }); }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={markReimbursementPaid}>Mark Paid</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={`Timesheet Review - Week ${timesheetAction?.week_start}`}
        open={Boolean(timesheetAction)}
        onClose={() => { setTimesheetAction(null); setTimesheetActionForm({ action: 'approve', comment: '' }); }}
      >
        {timesheetAction ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              <p><span className="font-semibold">Period:</span> {timesheetAction.week_start} to {timesheetAction.week_end}</p>
              <p><span className="font-semibold">Total Hours:</span> {Number(timesheetAction.total_hours || 0).toFixed(2)}h</p>
              <p><span className="font-semibold">Current Status:</span> {timesheetAction.status || '-'}</p>
              {timesheetAction.approval_comment ? <p><span className="font-semibold">Previous Comment:</span> {timesheetAction.approval_comment}</p> : null}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Action
              </label>
              <select
                value={timesheetActionForm.action}
                onChange={(e) => setTimesheetActionForm({ ...timesheetActionForm, action: e.target.value })}
                className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              >
                <option value="approve">Approve</option>
                <option value="needs_changes">Needs Changes</option>
                <option value="revoke">Revoke</option>
                <option value="reject">Reject</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Comment (optional)
              </label>
              <textarea
                value={timesheetActionForm.comment}
                onChange={(e) => setTimesheetActionForm({ ...timesheetActionForm, comment: e.target.value })}
                placeholder={
                  timesheetActionForm.action === 'needs_changes' 
                    ? 'Specify what changes are needed...'
                    : timesheetActionForm.action === 'reject'
                    ? 'Explain why the timesheet is being rejected...'
                    : 'Add approval notes (optional)...'
                }
                className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
                rows="4"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setTimesheetAction(null); setTimesheetActionForm({ action: 'approve', comment: '' }); }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={updateTimesheetStatus}>Submit Review</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
