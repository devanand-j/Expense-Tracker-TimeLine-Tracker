import React, { useState, useEffect } from 'react';
import { fetchMaterialTrackingLogs } from '../lib/materialTracking';
import { formatDate } from '../lib/time';
import toast from 'react-hot-toast';

export default function MaterialTrackingHistory({ userId }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState('all');

  useEffect(() => {
    const loadLogs = async () => {
      try {
        setIsLoading(true);
        const data = await fetchMaterialTrackingLogs(userId);
        setLogs(data);
      } catch (error) {
        console.error('Error loading logs:', error);
        toast.error('Failed to load tracking history');
      } finally {
        setIsLoading(false);
      }
    };

    if (userId) {
      loadLogs();
    }
  }, [userId]);

  const stageConfig = {
    warehouse_pickup: { label: 'Warehouse Pickup', color: 'blue', icon: '📦' },
    field_arrival: { label: 'Field Arrival', color: 'purple', icon: '🚀' },
    return_start: { label: 'Return Start', color: 'amber', icon: '🔄' },
    warehouse_return: { label: 'Warehouse Return', color: 'green', icon: '✓' }
  };

  const filteredLogs =
    selectedStage === 'all' ? logs : logs.filter((log) => log.stage === selectedStage);

  // Display dates as DD-MM-YYYY
  const formatLogDate = (dateStr) => formatDate(dateStr);

  const formatTime = (timeStr) => {
    const [h, m] = timeStr.split(':');
    return `${h}:${m}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-300 border-t-blue-600"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading tracking history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {['all', 'warehouse_pickup', 'field_arrival', 'return_start', 'warehouse_return'].map(
          (stage) => {
            const config = stageConfig[stage] || { label: 'All', color: 'slate' };
            return (
              <button
                key={stage}
                onClick={() => setSelectedStage(stage)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  selectedStage === stage
                    ? `bg-${config.color}-600 text-white`
                    : `bg-${config.color}-100 text-${config.color}-700 hover:bg-${config.color}-200 dark:bg-${config.color}-900/30 dark:text-${config.color}-400`
                }`}
              >
                {stage === 'all' ? 'All Events' : config.label}
              </button>
            );
          }
        )}
      </div>

      {filteredLogs.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-12 text-center dark:border-slate-600 dark:bg-slate-800">
          <p className="text-slate-600 dark:text-slate-400">
            {selectedStage === 'all'
              ? 'No material tracking records yet'
              : `No ${stageConfig[selectedStage]?.label || 'records'} found`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => {
            const stageInfo = stageConfig[log.stage];
            return (
              <div
                key={log.id}
                className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{stageInfo.icon}</span>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {stageInfo.label}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        👤 {log.person_name || 'Unknown'} • {formatLogDate(log.event_date)} at {formatTime(log.event_time)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize text-white bg-${stageInfo.color}-600 dark:bg-${stageInfo.color}-700`}
                  >
                    {log.status}
                  </span>
                </div>

                {log.location_name && (
                  <div className="mb-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span>📍</span>
                    {log.location_name}
                  </div>
                )}

                {log.material_log_items?.length > 0 && (
                  <div className="mb-3 space-y-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Materials ({log.material_log_items.length})
                    </p>
                    <div className="max-h-24 overflow-y-auto rounded bg-slate-50 p-2 dark:bg-slate-700">
                      {log.material_log_items.map((item) => (
                        <div key={item.id} className="text-xs text-slate-600 dark:text-slate-400">
                          ✓ Expected: {item.expected_count} | Actual: {item.actual_count}
                          {item.condition && ` | Condition: ${item.condition}`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {log.notes && (
                  <div className="mt-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-700">
                    <p className="text-xs text-slate-600 dark:text-slate-400">{log.notes}</p>
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  {log.person_photo_url && (
                    <a
                      href={log.person_photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      👤 Person Photo
                    </a>
                  )}
                  {log.material_set_photo_url && (
                    <a
                      href={log.material_set_photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      📸 Material Photo
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
