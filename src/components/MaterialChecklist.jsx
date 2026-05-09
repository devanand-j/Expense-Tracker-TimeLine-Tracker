import React, { useState, useEffect } from 'react';

export default function MaterialChecklist({ materials, onCheckedChange }) {
  const [checklist, setChecklist] = useState({});

  useEffect(() => {
    const initialChecklist = {};
    materials.forEach((m) => {
      initialChecklist[m.id] = m.isChecked || false;
    });
    setChecklist(initialChecklist);
  }, [materials]);

  const handleToggle = (materialId) => {
    const updated = { ...checklist, [materialId]: !checklist[materialId] };
    setChecklist(updated);
    onCheckedChange(updated);
  };

  const allChecked = Object.values(checklist).every((v) => v === true);
  const checkedCount = Object.values(checklist).filter((v) => v === true).length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Material Checklist
        </h3>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          {checkedCount} of {materials.length}
        </span>
      </div>

      <div className="space-y-2">
        {materials.map((material) => (
          <label
            key={material.id}
            className="flex cursor-pointer items-center rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <input
              type="checkbox"
              checked={checklist[material.id] || false}
              onChange={() => handleToggle(material.id)}
              className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="ml-3 flex-1">
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {material.name}
              </p>
              {material.serialNumber && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  SN: {material.serialNumber}
                </p>
              )}
            </div>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Qty: {material.expectedCount}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-700">
        {allChecked ? (
          <p className="flex items-center text-sm font-medium text-green-600 dark:text-green-400">
            ✓ All materials verified
          </p>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Please verify all materials before proceeding
          </p>
        )}
      </div>
    </div>
  );
}
