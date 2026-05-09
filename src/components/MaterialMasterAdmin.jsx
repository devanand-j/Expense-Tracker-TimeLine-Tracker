import React, { useState, useEffect } from 'react';
import {
  fetchMaterialMasters,
  createMaterialMaster,
  updateMaterialMaster,
  deleteMaterialMaster
} from '../lib/materialTracking';
import toast from 'react-hot-toast';
import { formatDate } from '../lib/time';

export default function MaterialMasterAdmin() {
  const [materials, setMaterials] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Accessory',
    quantity: 1,
    serial_number: '',
    acquisition_date: new Date().toISOString().split('T')[0],
    status: 'available',
    notes: ''
  });

  useEffect(() => {
    loadMaterials();
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;
    const handler = (e) => { if (e.key === 'Escape') handleCloseModal(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isModalOpen]);

  const loadMaterials = async () => {
    try {
      setIsLoading(true);
      const data = await fetchMaterialMasters();
      setMaterials(data);
    } catch (error) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (material = null) => {
    if (material) {
      setEditingId(material.id);
      setFormData({
        name: material.name,
        category: material.category,
        quantity: Number.isFinite(Number(material.quantity)) ? Number(material.quantity) : 1,
        serial_number: material.serial_number || '',
        acquisition_date: material.acquisition_date || new Date().toISOString().split('T')[0],
        status: material.status,
        notes: material.notes || ''
      });
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        category: 'Accessory',
        quantity: 1,
        serial_number: '',
        acquisition_date: new Date().toISOString().split('T')[0],
        status: 'available',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'quantity' ? value : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Material name is required');
      return;
    }

    try {
      if (editingId) {
        await updateMaterialMaster(editingId, formData);
        toast.success('Material updated successfully');
      } else {
        await createMaterialMaster(formData);
        toast.success('Material created successfully');
      }
      handleCloseModal();
      loadMaterials();
    } catch (error) {
      console.error('Error saving material:', error);
      toast.error(editingId ? 'Failed to update material' : 'Failed to create material');
    }
  };

  const handleDeleteMaterial = async (material) => {
    const ok = window.confirm(`Delete material "${material.name}" permanently? This cannot be undone.`);
    if (!ok) return;

    try {
      await deleteMaterialMaster(material.id);
      toast.success('Material deleted successfully');
      if (editingId === material.id) {
        handleCloseModal();
      }
      loadMaterials();
    } catch (error) {
      console.error('Error deleting material:', error);
      toast.error(error?.message || 'Failed to delete material');
    }
  };

  const categoryColors = {
    Camera: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    Lens: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    Accessory: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
  };

  const statusColors = {
    available: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    in_use: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    damaged: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    retired: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-300 border-t-blue-600"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading materials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            📦 Material Master
          </h2>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Manage your GoPro cameras, lenses, and accessories inventory
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
        >
          + Add Material
        </button>
      </div>

      {/* Materials Grid */}
      {materials.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-12 text-center dark:border-slate-600 dark:bg-slate-800">
          <p className="text-slate-600 dark:text-slate-400">
            No materials yet. Create your first material to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((material) => (
            <div
              key={material.id}
              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {material.name}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Qty: {Number(material.quantity || 1)}
                  </p>
                  {material.serial_number && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      SN: {material.serial_number}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleOpenModal(material)}
                  className="ml-2 rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteMaterial(material)}
                  className="ml-2 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Delete
                </button>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    categoryColors[material.category]
                  }`}
                >
                  {material.category}
                </span>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${
                    statusColors[material.status]
                  }`}
                >
                  {material.status.replace('_', ' ')}
                </span>
              </div>

              {material.acquisition_date && (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  📅 Added: {formatDate(material.acquisition_date)}
                </p>
              )}

              {material.notes && (
                <div className="mt-3 rounded-lg bg-slate-50 p-2 dark:bg-slate-700">
                  <p className="text-xs text-slate-600 dark:text-slate-400">{material.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(); }}
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-white dark:bg-slate-800">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {editingId ? 'Edit Material' : 'Add New Material'}
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Material Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., GoPro Hero 11, Wide Angle Lens"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Category
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                >
                  <option value="Camera">Camera</option>
                  <option value="Lens">Lens</option>
                  <option value="Accessory">Accessory</option>
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Quantity
                </label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <select
                    value={['1', '2', '3', '4', '5', '10', '20', '50', '100'].includes(String(formData.quantity)) ? String(formData.quantity) : 'custom'}
                    onChange={(event) => {
                      const nextValue = event.target.value === 'custom' ? formData.quantity : event.target.value;
                      setFormData((prev) => ({ ...prev, quantity: nextValue }));
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  >
                    {[1, 2, 3, 4, 5, 10, 20, 50, 100].map((count) => (
                      <option key={count} value={count}>{count}</option>
                    ))}
                    <option value="custom">Custom</option>
                  </select>
                  <input
                    type="number"
                    name="quantity"
                    min="1"
                    step="1"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    placeholder="Enter quantity"
                    className="rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose a common quantity or enter a custom value.</p>
              </div>

              {/* Serial Number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Serial Number
                </label>
                <input
                  type="text"
                  name="serial_number"
                  value={formData.serial_number}
                  onChange={handleInputChange}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>

              {/* Acquisition Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Acquisition Date
                </label>
                <input
                  type="date"
                  name="acquisition_date"
                  value={formData.acquisition_date}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                >
                  <option value="available">Available</option>
                  <option value="in_use">In Use</option>
                  <option value="damaged">Damaged</option>
                  <option value="retired">Retired</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  placeholder="Additional information..."
                  rows="3"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteMaterial(materials.find((item) => item.id === editingId) || { id: editingId, name: 'this material' })}
                    className="flex-1 rounded-lg border border-red-300 px-4 py-2 font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
