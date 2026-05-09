import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';

export default function AuditLogsViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    tableName: '',
    action: '',
    userId: '',
    startDate: '',
    endDate: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0
  });

  // Fetch audit logs with filters
  useEffect(() => {
    fetchAuditLogs();
  }, [filters, pagination.page]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select(
          `
          id,
          user_id,
          table_name,
          record_id,
          action,
          old_values,
          new_values,
          changes,
          reason,
          created_at,
          created_by,
          profiles:created_by(id, name, role)
          `,
          { count: 'exact' }
        );

      // Apply filters
      if (filters.tableName) {
        query = query.eq('table_name', filters.tableName);
      }
      if (filters.action) {
        query = query.eq('action', filters.action);
      }
      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters.startDate) {
        query = query.gte('created_at', new Date(filters.startDate).toISOString());
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endDate.toISOString());
      }

      // Apply ordering and pagination
      const offset = (pagination.page - 1) * pagination.pageSize;
      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + pagination.pageSize - 1);

      if (error) throw error;

      setLogs(data || []);
      setPagination(prev => ({ ...prev, total: count || 0 }));
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteAuditLog = async (logId) => {
    const ok = window.confirm('Delete this audit log permanently? This action cannot be undone.');
    if (!ok) return;

    try {
      const { error } = await supabase
        .from('audit_logs')
        .delete()
        .eq('id', logId);

      if (error) throw error;

      toast.success('Audit log deleted successfully');
      fetchAuditLogs();
    } catch (err) {
      console.error('Error deleting audit log:', err);
      toast.error('Failed to delete audit log');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Kolkata'
    });
  };

  const formatJson = (obj) => {
    if (!obj) return '-';
    return JSON.stringify(obj, null, 2);
  };

  const getActionBadgeColor = (action) => {
    switch (action) {
      case 'APPROVE':
        return 'bg-green-100 text-green-800';
      case 'REJECT':
        return 'bg-red-100 text-red-800';
      case 'DELETE':
        return 'bg-red-100 text-red-800';
      case 'INSERT':
        return 'bg-blue-100 text-blue-800';
      case 'UPDATE':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.pageSize);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold dark:text-white">Audit Logs</h2>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <input
          type="text"
          name="tableName"
          placeholder="Table name..."
          value={filters.tableName}
          onChange={handleFilterChange}
          className="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        />
        <select
          name="action"
          value={filters.action}
          onChange={handleFilterChange}
          className="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        >
          <option value="">All Actions</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
          <option value="APPROVE">APPROVE</option>
          <option value="REJECT">REJECT</option>
        </select>
        <input
          type="date"
          name="startDate"
          value={filters.startDate}
          onChange={handleFilterChange}
          className="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        />
        <input
          type="date"
          name="endDate"
          value={filters.endDate}
          onChange={handleFilterChange}
          className="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        />
        <button
          onClick={() => {
            setFilters({
              tableName: '',
              action: '',
              userId: '',
              startDate: '',
              endDate: ''
            });
            setPagination({ page: 1, pageSize: 20, total: 0 });
          }}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Clear Filters
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2 text-left font-semibold dark:text-white">Timestamp</th>
              <th className="px-4 py-2 text-left font-semibold dark:text-white">Table</th>
              <th className="px-4 py-2 text-left font-semibold dark:text-white">Action</th>
              <th className="px-4 py-2 text-left font-semibold dark:text-white">Performed By</th>
              <th className="px-4 py-2 text-left font-semibold dark:text-white">Reason</th>
              <th className="px-4 py-2 text-left font-semibold dark:text-white">Record ID</th>
              <th className="px-4 py-2 text-left font-semibold dark:text-white">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan="7" className="px-4 py-4 text-center dark:text-gray-300">
                  Loading...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-4 text-center dark:text-gray-300">
                  No audit logs found
                </td>
              </tr>
            ) : (
              logs.map(log => (
                <tr
                  key={log.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  title={`Changes: ${formatJson(log.changes)}`}
                >
                  <td className="px-4 py-2 dark:text-gray-300">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-4 py-2 dark:text-gray-300">
                    <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                      {log.table_name}
                    </code>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-3 py-1 rounded text-xs font-semibold ${getActionBadgeColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 dark:text-gray-300">
                    {log.profiles?.name || 'System'}
                  </td>
                  <td className="px-4 py-2 dark:text-gray-300 truncate max-w-xs">
                    {log.reason || '-'}
                  </td>
                  <td className="px-4 py-2 dark:text-gray-300">
                    <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                      {log.record_id.substring(0, 8)}...
                    </code>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => deleteAuditLog(log.id)}
                      className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition"
                      title="Delete audit log"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm dark:text-gray-400">
          Showing {logs.length > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0} to{' '}
          {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} entries
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
            disabled={pagination.page === 1}
            className="px-4 py-2 border rounded disabled:opacity-50 dark:border-gray-600 dark:text-white"
          >
            Previous
          </button>
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = i + 1;
              if (totalPages > 5 && pageNum === 4) {
                return <span key="dots">...</span>;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPagination(prev => ({ ...prev, page: pageNum }))}
                  className={`px-3 py-2 rounded ${
                    pagination.page === pageNum
                      ? 'bg-blue-500 text-white'
                      : 'border dark:border-gray-600 dark:text-white'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
            disabled={pagination.page === totalPages}
            className="px-4 py-2 border rounded disabled:opacity-50 dark:border-gray-600 dark:text-white"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
