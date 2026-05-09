import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import MaterialPickupForm from '../components/MaterialPickupForm';
import MaterialFieldArrivalForm from '../components/MaterialFieldArrivalForm';
import MaterialReturnStartForm from '../components/MaterialReturnStartForm';
import MaterialReturnWarehouseForm from '../components/MaterialReturnWarehouseForm';
import MaterialTrackingHistory from '../components/MaterialTrackingHistory';
import {
  fetchMaterialMasters,
  createMaterialTrackingLog,
  createMaterialLogItems
} from '../lib/materialTracking';
import toast from 'react-hot-toast';

export default function MaterialTrackingPage() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const [materials, setMaterials] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStage, setActiveStage] = useState('picker');
  const [selectedStage, setSelectedStage] = useState('warehouse_pickup');

  useEffect(() => {
    const loadMaterials = async () => {
      try {
        const data = await fetchMaterialMasters();
        const formattedMaterials = data.map((m) => ({
          id: m.id,
          name: m.name,
          category: m.category,
          serialNumber: m.serial_number,
          expectedCount: 1,
          isChecked: false
        }));
        setMaterials(formattedMaterials);
      } catch (error) {
        console.error('Error loading materials:', error);
        toast.error('Failed to load materials');
      }
    };

    if (user?.id) {
      loadMaterials();
    }
  }, [user?.id]);

  const handleFormSubmit = async (formData) => {
    setIsLoading(true);
    try {
      const now = new Date();
      const log = await createMaterialTrackingLog({
        user_id: user.id,
        person_name: formData.personName,
        stage: formData.stage,
        event_date: now.toISOString().split('T')[0],
        event_time: now.toTimeString().split(' ')[0],
        location_latitude: formData.location?.latitude,
        location_longitude: formData.location?.longitude,
        location_name: formData.location?.name,
        person_photo_url: formData.personPhotoUrl,
        material_set_photo_url: formData.materialSetPhotoUrl,
        notes: formData.notes,
        status: 'completed'
      });

      if (log && formData.items) {
        const itemsToCreate = formData.items.map((item) => ({
          log_id: log.id,
          material_id: item.material_id,
          expected_count: 1,
          actual_count: item.is_checked ? 1 : 0,
          is_checked: item.is_checked
        }));
        await createMaterialLogItems(itemsToCreate);
      }

      toast.success(`${formData.stage.replace(/_/g, ' ')} recorded successfully`);
      setActiveStage('history');
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('Failed to submit tracking record');
    } finally {
      setIsLoading(false);
    }
  };

  const stageOptions = [
    {
      id: 'warehouse_pickup',
      label: 'Warehouse Pickup',
      icon: '📦',
      description: 'Start: Collect materials from warehouse'
    },
    {
      id: 'field_arrival',
      label: 'Field Arrival',
      icon: '🚀',
      description: 'Confirm: Materials arrived at field location'
    },
    {
      id: 'return_start',
      label: 'Return Start',
      icon: '🔄',
      description: 'Begin: Starting return journey to warehouse'
    },
    {
      id: 'warehouse_return',
      label: 'Warehouse Return',
      icon: '✓',
      description: 'Complete: Materials returned to warehouse'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 dark:from-slate-900 dark:to-slate-800">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="p-6">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              📋 Material Tracking System
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Track GoPro cameras, lenses, and accessories from warehouse to field and back
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveStage('picker')}
            className={`px-4 py-3 font-medium transition-all ${
              activeStage === 'picker'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            New Tracking
          </button>
          <button
            onClick={() => setActiveStage('history')}
            className={`px-4 py-3 font-medium transition-all ${
              activeStage === 'history'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Tracking History
          </button>
        </div>

        {/* Stage Picker */}
        {activeStage === 'picker' && (
          <div className="space-y-4">
            {selectedStage === null ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {stageOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setSelectedStage(option.id)}
                    className="rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-all hover:border-blue-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 hover:dark:border-blue-500"
                  >
                    <div className="mb-2 text-3xl">{option.icon}</div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {option.label}
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {option.description}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => setSelectedStage(null)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  ← Back to Stage Selection
                </button>

                {selectedStage === 'warehouse_pickup' && (
                  <MaterialPickupForm
                    materials={materials}
                    onSubmit={handleFormSubmit}
                    isLoading={isLoading}
                  />
                )}

                {selectedStage === 'field_arrival' && (
                  <MaterialFieldArrivalForm
                    materials={materials}
                    onSubmit={handleFormSubmit}
                    isLoading={isLoading}
                  />
                )}

                {selectedStage === 'return_start' && (
                  <MaterialReturnStartForm
                    materials={materials}
                    onSubmit={handleFormSubmit}
                    isLoading={isLoading}
                  />
                )}

                {selectedStage === 'warehouse_return' && (
                  <MaterialReturnWarehouseForm
                    materials={materials}
                    onSubmit={handleFormSubmit}
                    isLoading={isLoading}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Tracking History */}
        {activeStage === 'history' && user?.id && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-6 text-2xl font-bold text-slate-900 dark:text-slate-100">
              Your Material Tracking History
            </h2>
            <MaterialTrackingHistory userId={user.id} />
          </div>
        )}
      </div>
    </div>
  );
}
