import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import MaterialMasterAdmin from '../components/MaterialMasterAdmin';
import {
  fetchAllMaterialTrackingLogs,
  getMaterialMismatchSummary,
  getMaterialInventoryStatus,
  fetchMaterialMasters
} from '../lib/materialTracking';
import toast from 'react-hot-toast';
import { formatDate } from '../lib/time';
import { Search, Package, Users, AlertTriangle, ClipboardList, BarChart3, Truck, Settings, MapPin, User } from 'lucide-react';

export default function MaterialTrackingAdmin() {
  const { dark } = useTheme();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [allLogs, setAllLogs] = useState([]);
  const [mismatches, setMismatches] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    const loadAllData = async () => {
      try {
        setIsLoading(true);
        const [logsResult, mismatchesResult, inventoryResult, materialsResult] = await Promise.allSettled([
          fetchAllMaterialTrackingLogs({
            dateRange: {
              start: dateRange.start,
              end: dateRange.end
            }
          }),
          getMaterialMismatchSummary(),
          getMaterialInventoryStatus(),
          fetchMaterialMasters()
        ]);

        if (logsResult.status === 'fulfilled') setAllLogs(logsResult.value);
        else {
          console.error('Failed to fetch material logs:', logsResult.reason);
          setAllLogs([]);
        }

        if (mismatchesResult.status === 'fulfilled') setMismatches(mismatchesResult.value);
        else {
          console.error('Failed to fetch mismatches:', mismatchesResult.reason);
          setMismatches([]);
        }

        if (inventoryResult.status === 'fulfilled') setInventory(inventoryResult.value);
        else {
          console.error('Failed to fetch inventory:', inventoryResult.reason);
          setInventory([]);
        }

        if (materialsResult.status === 'fulfilled') setMaterials(materialsResult.value);
        else {
          console.error('Failed to fetch material masters:', materialsResult.reason);
          setMaterials([]);
        }

        const hasFailure = [logsResult, mismatchesResult, inventoryResult, materialsResult].some(
          (result) => result.status === 'rejected'
        );
        if (hasFailure) {
          toast.error('Some admin widgets failed to load. Check console for details.');
        }
      } catch (error) {
        console.error('Error loading admin data:', error);
        toast.error('Failed to load admin data');
      } finally {
        setIsLoading(false);
      }
    };

    loadAllData();
  }, [dateRange]);

  const formatTime = (timeStr) => {
    const [h, m] = timeStr.split(':');
    return `${h}:${m}`;
  };

  const formatLogDate = (dateStr) => formatDate(dateStr);

  const stageConfig = {
    warehouse_pickup: { label: 'Warehouse Pickup', color: 'blue', icon: Package },
    field_arrival: { label: 'Field Arrival', color: 'purple', icon: Truck },
    return_start: { label: 'Return Start', color: 'amber', icon: Package },
    warehouse_return: { label: 'Warehouse Return', color: 'green', icon: Package }
  };

  // Get unique employees
  const uniqueEmployees = Array.from(
    new Map(allLogs.map((log) => [log.user_id, log.profiles])).values()
  );

  // Filter logs by employee if selected
  const filteredLogs = selectedEmployee
    ? allLogs.filter((log) => log.user_id === selectedEmployee)
    : allLogs;

  // Dashboard Stats
  const stats = {
    totalTracking: allLogs.length,
    uniqueEmployees: uniqueEmployees.length,
    totalMismatches: mismatches.length,
    materialCount: materials.length
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-300 border-t-blue-600"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 dark:from-slate-900 dark:to-slate-800">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <Search className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  Material Tracking Admin Panel
                </h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                  Monitor logistics, verify inventory, and track material movements
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: 'Total Tracking Records', value: stats.totalTracking, icon: ClipboardList },
            { label: 'Active Employees', value: stats.uniqueEmployees, icon: Users },
            { label: 'Mismatches', value: stats.totalMismatches, icon: AlertTriangle },
            { label: 'Total Materials', value: stats.materialCount, icon: Package }
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {stat.value}
                  </p>
                </div>
                <stat.icon className="h-8 w-8 text-blue-600" />
              </div>
            </div>
          ))}
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { id: 'movements', label: 'Material Movements', icon: Truck },
            { id: 'mismatches', label: 'Mismatches', icon: AlertTriangle },
            { id: 'inventory', label: 'Inventory', icon: Package },
            { id: 'material-master', label: 'Material Master', icon: Settings }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 font-medium transition-all ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <h3 className="mb-4 font-semibold text-slate-900 dark:text-slate-100">
                  Recent Activity
                </h3>
                <div className="space-y-2">
                  {allLogs.slice(0, 5).map((log) => {
                    const config = stageConfig[log.stage];
                    return (
                      <div
                        key={log.id}
                        className="flex items-center justify-between rounded-lg bg-slate-50 p-2 dark:bg-slate-700"
                      >
                        <div className="flex items-center gap-2">
                          <config.icon className="h-4 w-4 text-blue-600" />
                          <div>
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                              {config.label}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                              <User className="h-3 w-3" /> {log.person_name || log.profiles?.name || 'Unknown'}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatLogDate(log.event_date)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <h3 className="mb-4 font-semibold text-slate-900 dark:text-slate-100">
                  Tracking by Stage
                </h3>
                <div className="space-y-2">
                  {Object.entries(stageConfig).map(([stage, config]) => {
                    const count = allLogs.filter((log) => log.stage === stage).length;
                    return (
                      <div key={stage} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <config.icon className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {config.label}
                          </span>
                        </div>
                        <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Material Movements Tab */}
        {activeTab === 'movements' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <select
                value={selectedEmployee || ''}
                onChange={(e) => setSelectedEmployee(e.target.value || null)}
                className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              >
                <option value="">All Employees</option>
                {uniqueEmployees.map((emp) => (
                  <option key={emp?.id} value={emp?.id}>
                    {emp?.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>

            <div className="space-y-3">
              {filteredLogs.map((log) => {
                const config = stageConfig[log.stage];
                return (
                  <div
                    key={log.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <config.icon className="h-6 w-6 text-blue-600" />
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {config.label}
                            </p>
                            <p className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                              <User className="h-4 w-4" /> <span className="font-medium">{log.person_name || log.profiles?.name || 'Unknown'}</span> • {log.profiles?.name} • {formatLogDate(log.event_date)} {formatTime(log.event_time)}
                            </p>
                          </div>
                        </div>

                        {log.location_name && (
                          <p className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                            <MapPin className="h-4 w-4" /> {log.location_name}
                          </p>
                        )}

                        {log.material_log_items?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                              Items: {log.material_log_items.length}
                            </p>
                          </div>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium text-white bg-${config.color}-600`}
                      >
                        {log.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mismatches Tab */}
        {activeTab === 'mismatches' && (
          <div className="space-y-3">
            {mismatches.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-green-300 bg-green-50 py-12 text-center dark:border-green-700 dark:bg-green-900/20">
                <p className="text-green-700 dark:text-green-400">✓ No mismatches detected</p>
              </div>
            ) : (
              mismatches.map((mismatch) => (
                <div
                  key={mismatch.id}
                  className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-red-900 dark:text-red-100">
                        {mismatch.material_masters?.name}
                      </p>
                      <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                        Expected: {mismatch.expected_count} | Actual: {mismatch.actual_count}
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400">
                        Stage: {stageConfig[mismatch.material_tracking_logs?.stage]?.label}
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400">
                        Employee: {mismatch.material_tracking_logs?.profiles?.name}
                      </p>
                    </div>
                    <span className="rounded-lg bg-red-200 px-2 py-1 text-xs font-bold text-red-700 dark:bg-red-800 dark:text-red-200">
                      ⚠️ Mismatch
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div className="space-y-3">
            {materials.map((material) => (
              <div
                key={material.id}
                className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {material.name}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {material.category}
                      {material.serial_number && ` • SN: ${material.serial_number}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Status
                    </p>
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold text-white ${
                        material.status === 'available'
                          ? 'bg-green-600'
                          : material.status === 'in_use'
                            ? 'bg-blue-600'
                            : 'bg-red-600'
                      }`}
                    >
                      {material.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Material Master Tab */}
        {activeTab === 'material-master' && <MaterialMasterAdmin />}
      </div>
    </div>
  );
}
