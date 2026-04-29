import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx-js-style';
import { useAuth } from '../context/AuthContext';
import { exportReportAsPdfAndUpload, exportReportAsXlsxAndUpload, exportWorkbookAsXlsxAndUpload } from '../lib/export';
import { categoryShareRows } from '../lib/expenseCategories';
import { buildAllStaffTimesheet, buildRangeSummary, formatHoursAsLabel } from '../lib/reporting';
import { supabase } from '../lib/supabaseClient';
import { calculateDurationHours } from '../lib/time';

const COLORS = {
  titleFill: 'F4C7A1',
  headerFill: 'F8EEC0',
  labelFill: 'FFF6DF',
  dateFill: 'F3F4F6',
  white: 'FFFFFF',
  border: '1B1B1B',
  blueText: '1D4ED8'
};

function makeBorder(style = 'thin') {
  return {
    top: { style, color: { rgb: COLORS.border } },
    left: { style, color: { rgb: COLORS.border } },
    bottom: { style, color: { rgb: COLORS.border } },
    right: { style, color: { rgb: COLORS.border } }
  };
}

function applyStyle(ws, ref, style) {
  if (!ws[ref]) ws[ref] = { t: 's', v: '' };
  ws[ref].s = style;
}

function formatDownloadTime(dateValue) {
  const dt = new Date(dateValue);
  const hours12 = dt.getHours() % 12 || 12;
  const mins = String(dt.getMinutes()).padStart(2, '0');
  const suffix = dt.getHours() >= 12 ? 'PM' : 'AM';
  return `${String(hours12).padStart(2, '0')}:${mins} ${suffix}`;
}

function formatRangeDate(dateValue) {
  if (!dateValue) return '';
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).replace(/\s/g, '-');
}

function formatDownloadLabel(download) {
  const start = formatRangeDate(download.rangeStart);
  const end = formatRangeDate(download.rangeEnd);
  return `${start} to ${end} ${formatDownloadTime(download.downloadedAt)}`;
}

function toInputDate(dateValue) {
  const dt = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateForTitle(dateValue) {
  if (!dateValue) return '';
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short'
  }).toUpperCase();
}

function formatDateForCell(dateValue) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-GB');
}

function toSafeSheetName(rawName, usedNames) {
  const base = (rawName || 'Staff')
    .replace(/[\\/?*:[\]]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 28) || 'Staff';

  let candidate = base;
  let suffix = 1;
  while (usedNames.has(candidate)) {
    candidate = `${base.slice(0, Math.max(1, 28 - String(suffix).length))}${suffix}`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function createTimesheetWorksheet({ weekLabel, employeeName, rows }) {
  const aoa = [
    [],
    ['', '', '', `TIMESHEET FOR THE WEEK ${weekLabel}`],
    [],
    ['', '', 'Employee Name', '', employeeName],
    [],
    [
      '',
      '',
      'Date',
      'Day',
      'Project',
      'OnSite',
      'Remote Support',
      'Total Hours',
      'Day Shift Hours',
      'Night Shift Hours',
      'On Site timings',
      'Remote Timings'
    ]
  ];

  rows.forEach((row) => {
    aoa.push([
      '',
      '',
      formatDateForCell(row.date),
      row.day,
      row.projectLabel || '-',
      formatHoursAsLabel(row.onSiteHours),
      formatHoursAsLabel(row.remoteSupportHours),
      formatHoursAsLabel(row.workingHours),
      formatHoursAsLabel(row.dayShiftHours),
      formatHoursAsLabel(row.nightShiftHours),
      row.onSiteTimings || '-',
      row.remoteTimings || '-'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [
    { s: { r: 1, c: 3 }, e: { r: 1, c: 9 } },
    { s: { r: 3, c: 2 }, e: { r: 3, c: 3 } },
    { s: { r: 3, c: 4 }, e: { r: 3, c: 9 } }
  ];

  ws['!rows'] = [
    { hpt: 8 },
    { hpt: 24 },
    { hpt: 8 },
    { hpt: 20 },
    { hpt: 8 },
    { hpt: 20 },
    ...rows.map(() => ({ hpt: 22 }))
  ];

  ws['!cols'] = [
    { wch: 2 },
    { wch: 2 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 13 },
    { wch: 16 },
    { wch: 17 },
    { wch: 24 },
    { wch: 24 }
  ];

  const titleStyle = {
    font: { bold: true, sz: 16, color: { rgb: '000000' } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.titleFill } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: makeBorder('thin')
  };

  const labelStyle = {
    font: { bold: true, sz: 12, color: { rgb: '000000' } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.labelFill } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: makeBorder('thin')
  };

  const valueStyle = {
    font: { bold: true, sz: 12, color: { rgb: '000000' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: makeBorder('thin')
  };

  const headerStyle = {
    font: { bold: true, sz: 11, color: { rgb: '000000' } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.headerFill } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    border: makeBorder('thin')
  };

  const dateStyle = {
    font: { bold: true, color: { rgb: COLORS.blueText } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.dateFill } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: makeBorder('thin')
  };

  const dayStyle = {
    font: { bold: true, color: { rgb: COLORS.blueText } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.dateFill } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: makeBorder('thin')
  };

  const dataStyle = {
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: makeBorder('thin')
  };

  applyStyle(ws, 'D2', titleStyle);
  for (const cell of ['E2', 'F2', 'G2', 'H2', 'I2', 'J2']) applyStyle(ws, cell, titleStyle);
  applyStyle(ws, 'C4', labelStyle);
  applyStyle(ws, 'D4', labelStyle);
  applyStyle(ws, 'E4', valueStyle);
  applyStyle(ws, 'F4', valueStyle);
  applyStyle(ws, 'G4', valueStyle);
  applyStyle(ws, 'H4', valueStyle);
  applyStyle(ws, 'I4', valueStyle);
  applyStyle(ws, 'J4', valueStyle);

  ['C6', 'D6', 'E6', 'F6', 'G6', 'H6', 'I6', 'J6', 'K6', 'L6'].forEach((cell) => applyStyle(ws, cell, headerStyle));

  rows.forEach((_, index) => {
    const rowNumber = 7 + index;
    applyStyle(ws, `C${rowNumber}`, dateStyle);
    applyStyle(ws, `D${rowNumber}`, dayStyle);
    ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach((col) => applyStyle(ws, `${col}${rowNumber}`, dataStyle));
  });

  return ws;
}

function createConsolidatedTimesheetWorksheet({ users }) {
  const aoa = [
    [],
    ['', '', '', 'TIMESHEET FOR ALL STAFF'],
    [],
    ['', '', 'Employee Name', '', 'All Staff'],
    [],
    [
      '',
      '',
      'Employee Name',
      'Date',
      'Day',
      'Project',
      'OnSite',
      'Remote Support',
      'Total Hours',
      'Day Shift Hours',
      'Night Shift Hours',
      'On Site timings',
      'Remote Timings'
    ]
  ];

  users.forEach((staff) => {
    staff.rows.forEach((row) => {
      aoa.push([
        '',
        '',
        staff.userName,
        formatDateForCell(row.date),
        row.day,
        row.projectLabel || '-',
        formatHoursAsLabel(row.onSiteHours),
        formatHoursAsLabel(row.remoteSupportHours),
        formatHoursAsLabel(row.workingHours),
        formatHoursAsLabel(row.dayShiftHours),
        formatHoursAsLabel(row.nightShiftHours),
        row.onSiteTimings || '-',
        row.remoteTimings || '-'
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [
    { s: { r: 1, c: 3 }, e: { r: 1, c: 10 } },
    { s: { r: 3, c: 2 }, e: { r: 3, c: 4 } },
    { s: { r: 3, c: 5 }, e: { r: 3, c: 10 } }
  ];
  ws['!cols'] = [
    { wch: 2 },
    { wch: 2 },
    { wch: 26 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 13 },
    { wch: 16 },
    { wch: 17 },
    { wch: 24 },
    { wch: 24 }
  ];

  const headerStyle = {
    font: { bold: true, color: { rgb: '000000' } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.headerFill } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: makeBorder('thin')
  };

  const bodyStyle = {
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: makeBorder('thin')
  };

  applyStyle(ws, 'D2', {
    font: { bold: true, sz: 16, color: { rgb: '000000' } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.titleFill } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: makeBorder('thin')
  });
  applyStyle(ws, 'C4', {
    font: { bold: true, sz: 12, color: { rgb: '000000' } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.labelFill } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: makeBorder('thin')
  });
  applyStyle(ws, 'E4', {
    font: { bold: true, sz: 12, color: { rgb: '000000' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: makeBorder('thin')
  });

  ['C6', 'D6', 'E6', 'F6', 'G6', 'H6', 'I6', 'J6', 'K6', 'L6', 'M6', 'N6'].forEach((cell) => applyStyle(ws, cell, headerStyle));
  for (let rowNumber = 7; rowNumber <= aoa.length; rowNumber += 1) {
    ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'].forEach((col) => applyStyle(ws, `${col}${rowNumber}`, bodyStyle));
  }

  ws['!rows'] = [
    { hpt: 8 },
    { hpt: 24 },
    { hpt: 8 },
    { hpt: 20 },
    { hpt: 8 },
    { hpt: 22 },
    ...users.flatMap((staff) => staff.rows.map(() => ({ hpt: 22 })))
  ];

  return ws;
}

export default function ReportsPage() {
  const { user, profile } = useAuth();
  const [timeline, setTimeline] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [dbProjects, setDbProjects] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('all');
  const [selectedProject, setSelectedProject] = useState('all');
  const [allStaffExportFormat, setAllStaffExportFormat] = useState('excel');
  const [rangeStart, setRangeStart] = useState(() => {
    const today = new Date();
    return toInputDate(new Date(today.getFullYear(), today.getMonth(), 1));
  });
  const [rangeEnd, setRangeEnd] = useState(() => toInputDate(new Date()));

  useEffect(() => {
    async function load() {
      const timelineQuery = profile?.role === 'admin'
        ? supabase.from('timeline_entries').select('*, profiles(name)')
        : supabase.from('timeline_entries').select('*, profiles(name)').eq('user_id', user.id);

      const expenseQuery = profile?.role === 'admin'
        ? supabase.from('expenses').select('*, profiles(name)')
        : supabase.from('expenses').select('*, profiles(name)').eq('user_id', user.id);

      const profileQuery = profile?.role === 'admin'
        ? supabase.from('profiles').select('id, name').order('name', { ascending: true })
        : Promise.resolve({ data: [{ id: user.id, name: 'Me' }], error: null });

      const projectQuery = supabase.from('projects').select('name').eq('is_active', true).order('name', { ascending: true });

      const [timelineRes, expenseRes, profileRes, projectRes] = await Promise.all([
        timelineQuery,
        expenseQuery,
        profileQuery,
        projectQuery
      ]);

      if (timelineRes.error) { toast.error(timelineRes.error.message); return; }
      if (expenseRes.error) { toast.error(expenseRes.error.message); return; }
      if (profileRes.error) { toast.error(profileRes.error.message); return; }

      setTimeline(timelineRes.data || []);
      setExpenses(expenseRes.data || []);
      setProfiles(profileRes.data || []);
      setDbProjects((projectRes.data || []).map((p) => p.name));

      if (profile?.role !== 'admin') {
        setSelectedEmployeeId(user.id);
      }
    }

    load();
  }, [user.id, profile?.role]);

  const projectOptions = useMemo(() => {
    const dynamic = [
      ...timeline.map((e) => e.project).filter(Boolean),
      ...expenses.map((e) => e.project).filter(Boolean)
    ];
    return ['all', ...new Set([...dbProjects, ...dynamic])];
  }, [timeline, expenses, dbProjects]);

  const filteredTimeline = useMemo(() => timeline.filter((entry) => {
    if (selectedEmployeeId !== 'all' && entry.user_id !== selectedEmployeeId) return false;
    if (selectedProject !== 'all' && entry.project !== selectedProject) return false;
    return true;
  }), [timeline, selectedEmployeeId, selectedProject]);

  const filteredExpenses = useMemo(() => expenses.filter((entry) => {
    if (entry.status !== 'approved') return false;
    if (selectedEmployeeId !== 'all' && entry.user_id !== selectedEmployeeId) return false;
    if (selectedProject !== 'all' && entry.project !== selectedProject) return false;
    return true;
  }), [expenses, selectedEmployeeId, selectedProject]);

  const monthlyReport = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const monthlyTimeline = filteredTimeline.filter((x) => new Date(x.date).getMonth() === month);
    const monthlyExpenses = filteredExpenses.filter((x) => new Date(x.date).getMonth() === month);

    const totalHours = monthlyTimeline.reduce(
      (sum, entry) => sum + Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time)),
      0
    );

    const totalExpenses = monthlyExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

    const byCategory = monthlyExpenses.reduce((acc, item) => {
      categoryShareRows(item).forEach((row) => {
        acc[row.category] = (acc[row.category] || 0) + row.amount;
      });
      return acc;
    }, {});

    const byStatus = monthlyExpenses.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    return {
      totalHours: totalHours.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      byCategory,
      byStatus
    };
  }, [filteredTimeline, filteredExpenses]);

  const rangeSummary = useMemo(
    () => buildRangeSummary(filteredTimeline, filteredExpenses, rangeStart, rangeEnd),
    [filteredTimeline, filteredExpenses, rangeStart, rangeEnd]
  );

  const projectRows = useMemo(() => {
    const map = new Map();

    rangeSummary.filteredTimeline.forEach((entry) => {
      const project = entry.project || 'Unassigned';
      const current = map.get(project) || { project, hours: 0, expenses: 0 };
      current.hours += Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time));
      map.set(project, current);
    });

    rangeSummary.filteredExpenses.forEach((entry) => {
      const project = entry.project || 'Unassigned';
      const current = map.get(project) || { project, hours: 0, expenses: 0 };
      current.expenses += Number(entry.amount || 0);
      map.set(project, current);
    });

    return Array.from(map.values())
      .sort((a, b) => a.project.localeCompare(b.project))
      .map((row) => ({
        ...row,
        hours: Number(row.hours.toFixed(2)),
        expenses: Number(row.expenses.toFixed(2))
      }));
  }, [rangeSummary]);

  const combinedTotals = useMemo(() => {
    const totalHours = rangeSummary.filteredTimeline.reduce(
      (sum, entry) => sum + Number(entry.duration || calculateDurationHours(entry.start_time, entry.end_time)),
      0
    );

    const totalExpenses = rangeSummary.filteredExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

    return {
      totalHours: totalHours.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2)
    };
  }, [rangeSummary]);

  const handleResetRange = () => {
    const today = new Date();
    setRangeStart(toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)));
    setRangeEnd(toInputDate(new Date()));
  };

  const exportPdf = async () => {
    try {
      const rangeLabel = `${rangeStart || 'Start'} to ${rangeEnd || 'End'}`;
      const employeeLabel = selectedEmployeeId === 'all'
        ? 'All Employees'
        : (profiles.find((p) => p.id === selectedEmployeeId)?.name || 'Selected Employee');
      const projectLabel = selectedProject === 'all' ? 'All Projects' : selectedProject;
      const rows = [
        `Date Range: ${rangeLabel}`,
        `Employee: ${employeeLabel}`,
        `Project: ${projectLabel}`,
        `Total Working Hours: ${rangeSummary.totalHours}`,
        `Total Approved Expenses: ₹${rangeSummary.totalExpenses}`,
        'Daily Totals:',
        ...rangeSummary.dailyRows.map((row) => `  ${row.date} (${row.projectLabel || '-'}): ${row.workingHours}h, ₹${row.expenses}`),
        'Category Totals:',
        ...rangeSummary.categoryRows.map((row) => `  ${row.category}: ₹${row.amount}`),
        `Monthly Hours: ${monthlyReport.totalHours}`,
        `Monthly Approved Expenses: ₹${monthlyReport.totalExpenses}`,
        `Approval Status Breakdown: ${JSON.stringify(monthlyReport.byStatus)}`
      ];

      const url = await exportReportAsPdfAndUpload({
        title: 'Date Range Report',
        rows,
        fileName: 'date-range-report',
        userId: user.id
      });

      setDownloads((x) => [{ format: 'pdf', url, downloadedAt: new Date().toISOString(), rangeStart, rangeEnd }, ...x]);
      toast.success('PDF exported and uploaded');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const exportXlsx = async () => {
    try {
      const url = await exportReportAsXlsxAndUpload({
        sheetName: 'Date Range Report',
        jsonData: rangeSummary.exportRows,
        fileName: 'date-range-report',
        userId: user.id
      });

      setDownloads((x) => [{ format: 'excel', url, downloadedAt: new Date().toISOString(), rangeStart, rangeEnd }, ...x]);
      toast.success('Excel exported and uploaded');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const exportAllStaffTimesheet = async () => {
    if (profile?.role !== 'admin') {
      toast.error('Only admins can export all staff timesheets');
      return;
    }

    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
      toast.error('Choose a valid date range first');
      return;
    }

    try {
      const [timelineRes, profilesRes] = await Promise.all([
        (() => {
          let query = supabase
            .from('timeline_entries')
            .select('user_id, date, start_time, end_time, duration, type, project, profiles(name)')
            .gte('date', rangeStart)
            .lte('date', rangeEnd);
          if (selectedEmployeeId !== 'all') query = query.eq('user_id', selectedEmployeeId);
          if (selectedProject !== 'all') query = query.eq('project', selectedProject);
          return query;
        })(),
        supabase.from('profiles').select('id, name').order('name', { ascending: true })
      ]);

      if (timelineRes.error) throw timelineRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const selectedProfiles = selectedEmployeeId === 'all'
        ? (profilesRes.data || [])
        : (profilesRes.data || []).filter((p) => p.id === selectedEmployeeId);

      const report = buildAllStaffTimesheet(
        timelineRes.data || [],
        selectedProfiles,
        rangeStart,
        rangeEnd
      );

      const workbook = XLSX.utils.book_new();
      const sheetNames = new Set();
      const weekLabel = `${formatDateForTitle(rangeStart)} TO ${formatDateForTitle(rangeEnd)}`;

      const consolidated = createConsolidatedTimesheetWorksheet({ users: report.users });
      XLSX.utils.book_append_sheet(workbook, consolidated, 'All Staff Day Wise');

      report.users.forEach((staff) => {
        const worksheet = createTimesheetWorksheet({
          weekLabel,
          employeeName: staff.userName,
          rows: staff.rows
        });
        const sheetName = toSafeSheetName(staff.userName, sheetNames);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      });

      if (allStaffExportFormat === 'pdf') {
        const lines = [
          `Date Range: ${rangeStart} to ${rangeEnd}`,
          `Project: ${selectedProject === 'all' ? 'All Projects' : selectedProject}`
        ];

        report.users.forEach((staff) => {
          lines.push('');
          lines.push(`Employee: ${staff.userName}`);
          staff.rows
            .filter((row) => row.workingHours > 0 || row.onSiteHours > 0 || row.remoteSupportHours > 0)
            .forEach((row) => {
              lines.push(
                `${row.date} (${row.day}) | Project: ${row.projectLabel || '-'} | OnSite: ${row.onSiteHours}h | Remote: ${row.remoteSupportHours}h | Total: ${row.workingHours}h`
              );
            });
        });

        const pdfUrl = await exportReportAsPdfAndUpload({
          title: 'All Staff Timesheet',
          rows: lines,
          fileName: 'all-staff-timesheet',
          userId: user.id
        });

        setDownloads((x) => [{ format: 'pdf', url: pdfUrl, downloadedAt: new Date().toISOString(), rangeStart, rangeEnd }, ...x]);
        toast.success('All staff timesheet PDF exported and uploaded');
        return;
      }

      const url = await exportWorkbookAsXlsxAndUpload({
        workbook,
        fileName: 'all-staff-timesheet',
        userId: user.id
      });

      setDownloads((x) => [{ format: 'excel', url, downloadedAt: new Date().toISOString(), rangeStart, rangeEnd }, ...x]);
      toast.success('All staff timesheet Excel exported and uploaded');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <div className="card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-2 text-sm font-medium">
              <span>From Date</span>
              <input
                type="date"
                value={rangeStart}
                onChange={(event) => setRangeStart(event.target.value)}
                className="w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>To Date</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(event) => setRangeEnd(event.target.value)}
                className="w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              />
            </label>
            {profile?.role === 'admin' ? (
              <label className="space-y-2 text-sm font-medium">
                <span>Employee</span>
                <select
                  value={selectedEmployeeId}
                  onChange={(event) => setSelectedEmployeeId(event.target.value)}
                  className="w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
                >
                  <option value="all">All Employees</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            ) : null}
            <label className="space-y-2 text-sm font-medium">
              <span>Project</span>
              <select
                value={selectedProject}
                onChange={(event) => setSelectedProject(event.target.value)}
                className="w-full rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
              >
                <option value="all">All Projects</option>
                {projectOptions.filter((p) => p !== 'all').map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>

          <button type="button" className="btn-secondary self-start lg:self-auto" onClick={handleResetRange}>
            Reset to This Month
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Selected Hours</p>
          <p className="mt-2 text-2xl font-bold">{combinedTotals.totalHours}h</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Selected Approved Expenses</p>
          <p className="mt-2 text-2xl font-bold">₹{combinedTotals.totalExpenses}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Hours</p>
          <p className="mt-2 text-2xl font-bold">{monthlyReport.totalHours}h</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Approved Expenses</p>
          <p className="mt-2 text-2xl font-bold">₹{monthlyReport.totalExpenses}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto p-4">
          <h2 className="mb-3 font-semibold">Daily Hours and Approved Expenses</h2>
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                <th className="py-2">Date</th>
                <th>Day</th>
                <th>Project</th>
                <th>OnSite</th>
                <th>Remote Support</th>
                <th>Total Hours</th>
                <th>Day Shift</th>
                <th>Night Shift</th>
                <th>Expenses</th>
              </tr>
            </thead>
            <tbody>
              {rangeSummary.dailyRows.map((row) => (
                <tr key={row.date} className="border-b border-[#f1f1f1] dark:border-[#444]">
                  <td className="py-2">{row.date}</td>
                  <td>{row.day}</td>
                  <td>{row.projectLabel || '-'}</td>
                  <td>{row.onSiteHours}h</td>
                  <td>{row.remoteSupportHours}h</td>
                  <td>{row.workingHours}h</td>
                  <td>{row.dayShiftHours}h</td>
                  <td>{row.nightShiftHours}h</td>
                  <td>₹{row.expenses}</td>
                </tr>
              ))}
              {!rangeSummary.dailyRows.length ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={9}>No records for the selected date range.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto p-4">
          <h2 className="mb-3 font-semibold">Approved Expense Totals by Category</h2>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
                <th className="py-2">Category</th>
                <th>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {rangeSummary.categoryRows.map((row) => (
                <tr key={row.category} className="border-b border-[#f1f1f1] dark:border-[#444]">
                  <td className="py-2">{row.category}</td>
                  <td>₹{row.amount}</td>
                </tr>
              ))}
              {!rangeSummary.categoryRows.length ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={2}>No expense categories in the selected date range.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-x-auto p-4">
        <h2 className="mb-3 font-semibold">Project-wise Hours and Approved Expenses</h2>
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-[#dddddd] text-left dark:border-[#444]">
              <th className="py-2">Project</th>
              <th>Total Hours</th>
              <th>Total Expenses</th>
            </tr>
          </thead>
          <tbody>
            {projectRows.map((row) => (
              <tr key={row.project} className="border-b border-[#f1f1f1] dark:border-[#444]">
                <td className="py-2">{row.project}</td>
                <td>{row.hours}h</td>
                <td>₹{row.expenses}</td>
              </tr>
            ))}
            {!projectRows.length ? (
              <tr>
                <td className="py-3 text-slate-500" colSpan={3}>No project data in the selected date range.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" onClick={exportPdf}>
          Export PDF
        </button>
        <button className="btn-secondary" onClick={exportXlsx}>
          Export Excel
        </button>
        {profile?.role === 'admin' ? (
          <>
            <select
              value={allStaffExportFormat}
              onChange={(event) => setAllStaffExportFormat(event.target.value)}
              className="rounded-lg border border-[#dddddd] bg-white px-3 py-2 text-sm outline-none transition focus:border-teal dark:border-[#444] dark:bg-[#2b2b2b]"
            >
              <option value="excel">Excel</option>
              <option value="pdf">PDF</option>
            </select>
            <button className="btn-secondary" onClick={exportAllStaffTimesheet}>
              Export All Staff Timesheet
            </button>
          </>
        ) : null}
      </div>

      <div className="card p-4">
        <h2 className="mb-3 font-semibold">Generated Files</h2>
        <ul className="space-y-2 text-sm">
          {downloads.map((item, idx) => (
            <li key={`${item.url}-${idx}`}>
              {formatDownloadLabel(item)} {'-'}{' '}
              <a href={item.url} target="_blank" rel="noreferrer" className="text-teal underline">
                Download {item.format}
              </a>
            </li>
          ))}
          {!downloads.length ? <li>No generated files in this session yet.</li> : null}
        </ul>
      </div>
    </div>
  );
}
