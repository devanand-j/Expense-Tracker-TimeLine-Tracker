import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import AdminOverview from './AdminOverview';
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
import { calculateDurationHours } from '../lib/time';

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
  const dt = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AdminPage() {
  const { user, profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectAssignments, setProjectAssignments] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [weeklySheets, setWeeklySheets] = useState([]);
  const [reimbursements, setReimbursements] = useState([]);
  const [expenseStatusFilter, setExpenseStatusFilter] = useState('all');
  const [timesheetStatusFilter, setTimesheetStatusFilter] = useState('all');
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
  const [statusAction, setStatusAction] = useState(null);
  const [statusComment, setStatusComment] = useState('');
  const [timesheetAction, setTimesheetAction] = useState(null);
  const [timesheetComment, setTimesheetComment] = useState('');
  const [leaveAction, setLeaveAction] = useState(null);
  const [leaveComment, setLeaveComment] = useState('');
  const [historyPreview, setHistoryPreview] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [reimbursementAction, setReimbursementAction] = useState(null);
  const [reimbursementForm, setReimbursementForm] = useState({ payment_mode: 'bank_transfer', transaction_reference: '' });
  const [unrecognizedProjects, setUnrecognizedProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState('timesheet');
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [rangeStart, setRangeStart] = useState(() => {
    const today = new Date();
    return toInputDate(new Date(today.getFullYear(), today.getMonth(), 1));
  });
  const [rangeEnd, setRangeEnd] = useState(() => toInputDate(new Date()));

  async function loadEmployees() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role, created_at')
      .eq('role', 'employee')
      .order('name', { ascending: true });

    if (error) {
      toast.error(error.message);
      return [];
    }

    return data || [];
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

  // #5: Bulk approve timesheets
  const bulkApproveTimesheets = async () => {
    if (!bulkSelected.size) return;
    setBulkApproving(true);
    const ids = [...bulkSelected];
    const now = new Date().toISOString();
    const results = await Promise.all(
      ids.map((id) => {
        const sheet = weeklySheets.find((s) => s.id === id);
        const nextHistory = [
          ...(Array.isArray(sheet?.status_history) ? sheet.status_history : []),
          { status: 'approved', comment: 'Bulk approved', changed_at: now, changed_by: user?.id || null }
        ];
        return supabase.from('weekly_timesheets').update({
          status: 'approved',
          approval_comment: 'Bulk approved',
          status_history: nextHistory,
          reviewed_by: user?.id || null,
          reviewed_at: now
        }).eq('id', id);
      })
    );
    setBulkApproving(false);
    const errors = results.filter((r) => r.error);
    if (errors.length) toast.error(`${errors.length} approval(s) failed`);
    else toast.success(`${ids.length} timesheet(s) approved`);
    setBulkSelected(new Set());
    loadEmployeeData(selectedEmployeeId);
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

  const openStatusAction = (entry, status) => {
    setStatusAction({ entry, status });
    setStatusComment('');
  };

  const openTimesheetAction = (sheet, status) => {
    setTimesheetAction({ sheet, status });
    setTimesheetComment('');
  };

  const openLeaveAction = (request, status) => {
    setLeaveAction({ request, status });
    setLeaveComment('');
  };

  const updateStatus = async () => {
    if (!statusAction) return;
    const { entry, status } = statusAction;

    const nextHistory = [
      ...(Array.isArray(entry.status_history) ? entry.status_history : []),
      {
        status,
        comment: String(statusComment || '').trim(),
        changed_at: new Date().toISOString(),
        changed_by: user?.id || null
      }
    ];

    // #14: Optimistic update
    setExpenses((prev) => prev.map((e) => e.id === entry.id ? { ...e, status, approval_comment: String(statusComment || '').trim() || null } : e));
    setStatusAction(null);
    setStatusComment('');

    const { error } = await supabase
      .from('expenses')
      .update({
        status,
        approval_comment: String(statusComment || '').trim() || null,
        status_history: nextHistory
      })
      .eq('id', entry.id);

    if (error) {
      toast.error(error.message);
      loadEmployeeData(selectedEmployeeId); // revert on error
      return;
    }

    toast.success(`Expense ${status}`);
  };

  const updateTimesheetStatus = async () => {
    if (!timesheetAction) return;
    const { sheet, status } = timesheetAction;

    const nextHistory = [
      ...(Array.isArray(sheet.status_history) ? sheet.status_history : []),
      {
        status,
        comment: String(timesheetComment || '').trim(),
        changed_at: new Date().toISOString(),
        changed_by: user?.id || null
      }
    ];

    // #14: Optimistic update
    setWeeklySheets((prev) => prev.map((s) => s.id === sheet.id ? { ...s, status, approval_comment: String(timesheetComment || '').trim() || null } : s));
    setTimesheetAction(null);
    setTimesheetComment('');

    const { error } = await supabase
      .from('weekly_timesheets')
      .update({
        status,
        approval_comment: String(timesheetComment || '').trim() || null,
        status_history: nextHistory,
        reviewed_by: user?.id || null,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', sheet.id);

    if (error) {
      toast.error(error.message);
      loadEmployeeData(selectedEmployeeId); // revert on error
      return;
    }

    toast.success(`Weekly timesheet ${status}`);
  };

  const updateLeaveStatus = async () => {
    if (!leaveAction) return;
    const { request, status } = leaveAction;

    const nextHistory = [
      ...(Array.isArray(request.status_history) ? request.status_history : []),
      {
        status,
        comment: String(leaveComment || '').trim(),
        changed_at: new Date().toISOString(),
        changed_by: user?.id || null
      }
    ];

    const { error } = await supabase
      .from('leave_requests')
      .update({
        status,
        approval_comment: String(leaveComment || '').trim() || null,
        status_history: nextHistory,
        reviewed_by: user?.id || null,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', request.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setLeaveAction(null);
    setLeaveComment('');
    toast.success(`Leave request ${status}`);
    loadEmployeeData(selectedEmployeeId);
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

  if (loading) {
    return <div className="card p-4 text-sm">Loading employee data...</div>;
  }

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

        <div className="flex flex-wrap gap-2">
          {employees.map((employee) => (
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
              {employee.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'timesheet', label: 'Timesheet' },
          { key: 'leave', label: 'Leave' },
          { key: 'expenses', label: 'Expenses' }
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
                {bulkSelected.size > 0 ? (
                  <button
                    type="button"
                    className="btn-primary px-3 py-1 text-xs"
                    onClick={bulkApproveTimesheets}
                    disabled={bulkApproving}
                  >
                    {bulkApproving ? 'Approving...' : `Approve Selected (${bulkSelected.size})`}
                  </button>
                ) : null}
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
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        disabled={sheet.status === 'approved'}
                        checked={bulkSelected.has(sheet.id)}
                        onChange={(e) => setBulkSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(sheet.id); else next.delete(sheet.id);
                          return next;
                        })}
                      />
                      <span>Select</span>
                    </label>
                    <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => openTimesheetAction(sheet, 'approved')} disabled={sheet.status === 'approved'}>Approve</button>
                    <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => openTimesheetAction(sheet, 'needs_changes')} disabled={sheet.status === 'needs_changes'}>Need Changes</button>
                    <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(sheet)}>History</button>
                  </div>
                </div>
              ))}
              {!filteredWeeklySheets.length ? <p className="text-sm text-slate-500">No weekly timesheets match the selected filter.</p> : null}
            </div>

            <table className="hidden w-full min-w-[1100px] text-sm md:table">
              <thead>
                <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                  <th className="py-2 pr-2">
                    <input type="checkbox" onChange={(e) => {
                      if (e.target.checked) setBulkSelected(new Set(filteredWeeklySheets.filter((s) => s.status !== 'approved').map((s) => s.id)));
                      else setBulkSelected(new Set());
                    }} checked={bulkSelected.size > 0 && bulkSelected.size === filteredWeeklySheets.filter((s) => s.status !== 'approved').length} />
                  </th>
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
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        disabled={sheet.status === 'approved'}
                        checked={bulkSelected.has(sheet.id)}
                        onChange={(e) => setBulkSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(sheet.id); else next.delete(sheet.id);
                          return next;
                        })}
                      />
                    </td>
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
                        <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => openTimesheetAction(sheet, 'approved')} disabled={sheet.status === 'approved'}>Approve</button>
                        <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => openTimesheetAction(sheet, 'needs_changes')} disabled={sheet.status === 'needs_changes'}>Need Changes</button>
                        <button type="button" className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300" onClick={() => openTimesheetAction(sheet, 'rejected')} disabled={sheet.status === 'rejected'}>Reject</button>
                        <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(sheet)}>History</button>
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
                  <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => openLeaveAction(request, 'approved')} disabled={request.status === 'approved'}>Approve</button>
                  <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => openLeaveAction(request, 'rejected')} disabled={request.status === 'rejected'}>Reject</button>
                  <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(request)}>History</button>
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
                  <td className="max-w-[180px] truncate">{request.subject}</td>
                  <td className="max-w-[220px] truncate">{request.content}</td>
                  <td className="capitalize">{request.status}</td>
                  <td>{request.submitted_at ? new Date(request.submitted_at).toLocaleString() : '—'}</td>
                  <td className="max-w-[180px] truncate">{request.approval_comment || '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => openLeaveAction(request, 'approved')} disabled={request.status === 'approved'}>Approve</button>
                      <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => openLeaveAction(request, 'rejected')} disabled={request.status === 'rejected'}>Reject</button>
                      <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => openLeaveAction(request, 'pending')} disabled={request.status === 'pending'}>Pending</button>
                      <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(request)}>History</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredLeaveRequests.length ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={8}>No leave requests match the selected filter.</td>
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
                    <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => openStatusAction(entry, 'approved')} disabled={entry.status === 'approved'}>Approve</button>
                    <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => openStatusAction(entry, 'rejected')} disabled={entry.status === 'rejected'}>Reject</button>
                    <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => openStatusAction(entry, 'pending')} disabled={entry.status === 'pending'}>Pending</button>
                    <button type="button" className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]" onClick={() => setHistoryPreview(entry)}>History</button>
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
                        <button
                          type="button"
                          className="btn-primary px-3 py-1 text-xs"
                          onClick={() => openStatusAction(entry, 'approved')}
                          disabled={entry.status === 'approved'}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn-secondary px-3 py-1 text-xs"
                          onClick={() => openStatusAction(entry, 'rejected')}
                          disabled={entry.status === 'rejected'}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]"
                          onClick={() => openStatusAction(entry, 'pending')}
                          disabled={entry.status === 'pending'}
                        >
                          Pending
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-[#dddddd] bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#f1f1f1] dark:border-[#444] dark:bg-[#2b2b2b] dark:text-slate-200 dark:hover:bg-[#303030]"
                          onClick={() => setHistoryPreview(entry)}
                        >
                          History
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                          onClick={() => deleteExpenseAsAdmin(entry)}
                        >
                          Delete
                        </button>
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


      <Modal
        title={statusAction ? `Update Expense to ${statusAction.status}` : 'Update Expense Status'}
        open={Boolean(statusAction)}
        onClose={() => { setStatusAction(null); setStatusComment(''); }}
      >
        {statusAction ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              <p><span className="font-semibold">Date:</span> {statusAction.entry.date}</p>
              <p><span className="font-semibold">Project:</span> {statusAction.entry.project || '-'}</p>
              <p><span className="font-semibold">Amount:</span> ₹{Number(statusAction.entry.amount || 0).toFixed(2)}</p>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Comment (optional)
              </label>
              <textarea
                rows={3}
                value={statusComment}
                onChange={(event) => setStatusComment(event.target.value)}
                placeholder="Add reason or context for this status update"
                className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setStatusAction(null); setStatusComment(''); }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={updateStatus}>Save</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={timesheetAction ? `Update Weekly Timesheet to ${timesheetAction.status}` : 'Update Weekly Timesheet Status'}
        open={Boolean(timesheetAction)}
        onClose={() => { setTimesheetAction(null); setTimesheetComment(''); }}
      >
        {timesheetAction ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              <p><span className="font-semibold">Week:</span> {timesheetAction.sheet.week_start} to {timesheetAction.sheet.week_end}</p>
              <p><span className="font-semibold">Hours:</span> {Number(timesheetAction.sheet.total_hours || 0).toFixed(2)}h</p>
              <p><span className="font-semibold">Status:</span> {timesheetAction.sheet.status}</p>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Comment (optional)
              </label>
              <textarea
                rows={3}
                value={timesheetComment}
                onChange={(event) => setTimesheetComment(event.target.value)}
                placeholder="Add a note for the employee"
                className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setTimesheetAction(null); setTimesheetComment(''); }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={updateTimesheetStatus}>Save</button>
            </div>
          </div>
        ) : null}
      </Modal>

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
        title={leaveAction ? `Update Leave Request to ${leaveAction.status}` : 'Update Leave Status'}
        open={Boolean(leaveAction)}
        onClose={() => { setLeaveAction(null); setLeaveComment(''); }}
      >
        {leaveAction ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#dddddd] p-3 text-sm dark:border-[#444]">
              <p><span className="font-semibold">Type:</span> {leaveAction.request.leave_type}</p>
              <p><span className="font-semibold">Period:</span> {leaveAction.request.start_date} to {leaveAction.request.end_date}</p>
              <p><span className="font-semibold">Subject:</span> {leaveAction.request.subject}</p>
              <p><span className="font-semibold">Current Status:</span> {leaveAction.request.status}</p>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Comment (optional)
              </label>
              <textarea
                rows={3}
                value={leaveComment}
                onChange={(event) => setLeaveComment(event.target.value)}
                placeholder="Add a note for the employee"
                className="mt-2 w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setLeaveAction(null); setLeaveComment(''); }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={updateLeaveStatus}>Save</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={receiptPreview?.title || 'Receipt Preview'}
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
    </div>
  );
}
