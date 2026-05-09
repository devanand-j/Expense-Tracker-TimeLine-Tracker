import React, { useState, useRef } from 'react';
import { uploadMaterialPhoto } from '../lib/materialTracking';
import toast from 'react-hot-toast';

export default function PhotoUploadSection({ label, onPhotoUpload, isLoading, maxSize = 2 }) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (in MB)
    if (file.size > maxSize * 1024 * 1024) {
      toast.error(`File size must be less than ${maxSize}MB`);
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);

    // Upload to Supabase
    setIsUploading(true);
    try {
      const url = await uploadMaterialPhoto(file);
      setUploadedUrl(url);
      onPhotoUpload(url);
      toast.success('Photo uploaded successfully');
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error?.message || 'Failed to upload photo. Please try again.');
      setPreview(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setUploadedUrl(null);
    onPhotoUpload(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 dark:border-slate-600 dark:bg-slate-800">
      <label className="block">
        <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {label} <span className="text-red-500">*</span>
        </p>
        <p className="mb-4 text-xs text-slate-600 dark:text-slate-400">
          Click to upload or drag and drop (Max {maxSize}MB)
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={isUploading || isLoading}
          className="hidden"
        />

        {!preview && !uploadedUrl ? (
          <div
            onClick={handleClick}
            className="cursor-pointer rounded-lg border border-slate-300 bg-white p-8 text-center dark:border-slate-600 dark:bg-slate-700 hover:border-slate-400 dark:hover:border-slate-500 transition"
          >
            <svg
              className="mx-auto h-12 w-12 text-slate-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-10-5v10m0 0l-3-3m3 3l3-3"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {isUploading ? 'Uploading...' : 'Click to select image'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <img
              src={preview || uploadedUrl}
              alt="Preview"
              className="mx-auto max-h-64 rounded-lg object-cover"
            />
            <button
              type="button"
              onClick={handleRemove}
              disabled={isUploading || isLoading}
              className="w-full rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-700 transition"
            >
              Remove Photo
            </button>
          </div>
        )}
      </label>
    </div>
  );
}
