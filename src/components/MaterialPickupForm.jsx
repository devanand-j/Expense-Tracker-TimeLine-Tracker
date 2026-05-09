import React, { useState, useEffect } from 'react';
import MaterialChecklist from './MaterialChecklist';
import MaterialPhotoUpload from './MaterialPhotoUpload';
import LocationCapture from './LocationCapture';
import toast from 'react-hot-toast';

export default function MaterialPickupForm({ materials, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    personName: '',
    checklist: {},
    personPhotoUrl: null,
    materialSetPhotoUrl: null,
    location: { latitude: null, longitude: null, name: '' },
    notes: ''
  });

  const handleChecklistChange = (checklist) => {
    setFormData((prev) => ({ ...prev, checklist }));
  };

  const handlePersonPhotoUpload = (url) => {
    setFormData((prev) => ({ ...prev, personPhotoUrl: url }));
  };

  const handleMaterialPhotoUpload = (url) => {
    setFormData((prev) => ({ ...prev, materialSetPhotoUrl: url }));
  };

  const handleLocationChange = (location) => {
    setFormData((prev) => ({ ...prev, location }));
  };

  const handleNotesChange = (e) => {
    setFormData((prev) => ({ ...prev, notes: e.target.value }));
  };

  const handlePersonNameChange = (e) => {
    setFormData((prev) => ({ ...prev, personName: e.target.value }));
  };

  const validateForm = () => {
    if (!formData.personName || !formData.personName.trim()) {
      toast.error('Please enter the name of the person collecting materials');
      return false;
    }
    const allChecked = Object.values(formData.checklist).every((v) => v === true);
    if (!allChecked) {
      toast.error('Please verify all materials before submission');
      return false;
    }
    if (!formData.personPhotoUrl) {
      toast.error('Photo of person is required');
      return false;
    }
    if (!formData.materialSetPhotoUrl) {
      toast.error('Photo of material set is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      await onSubmit({
        stage: 'warehouse_pickup',
        personName: formData.personName,
        personPhotoUrl: formData.personPhotoUrl,
        materialSetPhotoUrl: formData.materialSetPhotoUrl,
        location: formData.location,
        notes: formData.notes,
        items: Object.entries(formData.checklist).map(([materialId, isChecked]) => ({
          material_id: materialId,
          is_checked: isChecked
        }))
      });
    } catch (error) {
      console.error('Submission error:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-2xl font-bold text-slate-900 dark:text-slate-100">
          Warehouse Material Pickup
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          Verify all materials, upload photos, and confirm pickup details
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <label className="block">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            👤 Name of Person Collecting Materials <span className="text-red-500">*</span>
          </p>
          <input
            type="text"
            value={formData.personName}
            onChange={handlePersonNameChange}
            placeholder="Enter full name of person picking up materials"
            maxLength="100"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Required: This will be recorded as who took the materials and at what time
          </p>
        </label>
      </div>

      <MaterialChecklist materials={materials} onCheckedChange={handleChecklistChange} />

      <MaterialPhotoUpload
        label="Photo of Person Collecting Materials"
        onPhotoUpload={handlePersonPhotoUpload}
        isLoading={isLoading}
      />

      <MaterialPhotoUpload
        label="Photo of Complete Material Set"
        onPhotoUpload={handleMaterialPhotoUpload}
        isLoading={isLoading}
      />

      <LocationCapture onLocationChange={handleLocationChange} isLoading={isLoading} />

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <label className="block">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Additional Notes (Optional)
          </p>
          <textarea
            value={formData.notes}
            onChange={handleNotesChange}
            placeholder="Add any additional information about the pickup..."
            rows="4"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-800"
      >
        {isLoading ? 'Submitting...' : 'Submit Warehouse Pickup'}
      </button>
    </form>
  );
}
