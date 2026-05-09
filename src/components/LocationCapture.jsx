import React, { useState, useEffect } from 'react';
import { getCurrentLocation } from '../lib/materialTracking';
import toast from 'react-hot-toast';

export default function LocationCapture({ onLocationChange, isLoading }) {
  const [location, setLocation] = useState(null);
  const [customLocation, setCustomLocation] = useState('');
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [useCustom, setUseCustom] = useState(false);

  const handleGetLocation = async () => {
    setIsGettingLocation(true);
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
      setUseCustom(false);
      onLocationChange({
        latitude: loc.latitude,
        longitude: loc.longitude,
        name: `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`
      });
      toast.success('Location captured successfully');
    } catch (error) {
      console.error('Location error:', error);
      toast.error('Could not capture location. Please enable location access.');
      setUseCustom(true);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleOpenMaps = () => {
    if (!location) {
      toast.error('No location captured yet');
      return;
    }
    const mapsUrl = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
    window.open(mapsUrl, '_blank');
  };

  const handleCustomLocation = (e) => {
    const value = e.target.value;
    setCustomLocation(value);
    onLocationChange({
      latitude: null,
      longitude: null,
      name: value
    });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
        Location
      </h3>

      {!useCustom ? (
        <div className="space-y-3">
          {location ? (
            <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                ✓ Location Captured
              </p>
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                Lat: {location.latitude.toFixed(4)}, Lon: {location.longitude.toFixed(4)}
              </p>
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                Accuracy: ±{location.accuracy?.toFixed(0)}m
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleOpenMaps}
                  className="flex items-center gap-1 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View on Maps
                </button>
                <button
                  type="button"
                  onClick={() => setUseCustom(true)}
                  className="text-xs font-medium text-green-700 underline hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                >
                  Use custom location instead
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={isGettingLocation || isLoading}
              className="flex w-full items-center justify-center rounded-lg border-2 border-blue-300 bg-blue-50 px-4 py-3 font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
            >
              <svg
                className="mr-2 h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {isGettingLocation ? 'Getting Location...' : 'Capture Current Location'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Enter Location
            </p>
            <input
              type="text"
              value={customLocation}
              onChange={handleCustomLocation}
              placeholder="e.g., Studio A, Field Site 1"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </label>
          <button
            type="button"
            onClick={handleGetLocation}
            disabled={isGettingLocation || isLoading}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Try GPS again
          </button>
        </div>
      )}
    </div>
  );
}
