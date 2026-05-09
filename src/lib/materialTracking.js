import { supabase } from './supabaseClient';

// ============ MATERIAL MASTERS ============

function normalizeMaterialMasterPayload(payload = {}) {
  const parsedQuantity = Number.parseInt(payload.quantity, 10);
  return {
    ...payload,
    name: typeof payload.name === 'string' ? payload.name.trim() : payload.name,
    category: typeof payload.category === 'string' ? payload.category.trim() : payload.category,
    quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1,
    serial_number: typeof payload.serial_number === 'string' && payload.serial_number.trim() !== ''
      ? payload.serial_number.trim()
      : null,
    acquisition_date: typeof payload.acquisition_date === 'string' && payload.acquisition_date.trim() === ''
      ? null
      : payload.acquisition_date,
    notes: typeof payload.notes === 'string' && payload.notes.trim() !== ''
      ? payload.notes.trim()
      : null
  };
}

export async function fetchMaterialMasters() {
  const { data, error } = await supabase
    .from('material_masters')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchMaterialsByCategory(category) {
  const { data, error } = await supabase
    .from('material_masters')
    .select('*')
    .eq('category', category)
    .eq('status', 'available')
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function createMaterialMaster(payload) {
  const { data, error } = await supabase
    .from('material_masters')
    .insert([normalizeMaterialMasterPayload(payload)])
    .select();
  if (error) throw error;
  return data?.[0];
}

export async function updateMaterialMaster(id, updates) {
  const { data, error } = await supabase
    .from('material_masters')
    .update(normalizeMaterialMasterPayload(updates))
    .eq('id', id)
    .select();
  if (error) throw error;
  return data?.[0];
}

export async function deleteMaterialMaster(id) {
  const { error } = await supabase
    .from('material_masters')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// ============ MATERIAL TRACKING LOGS ============

export async function createMaterialTrackingLog(payload) {
  const { data, error } = await supabase
    .from('material_tracking_logs')
    .insert([payload])
    .select();
  if (error) throw error;
  return data?.[0];
}

export async function fetchMaterialTrackingLogs(userId, filters = {}) {
  let query = supabase
    .from('material_tracking_logs')
    .select(`
      *,
      material_log_items(*)
    `)
    .eq('user_id', userId);

  if (filters.stage) {
    query = query.eq('stage', filters.stage);
  }

  if (filters.dateRange) {
    const { start, end } = filters.dateRange;
    query = query.gte('event_date', start).lte('event_date', end);
  }

  const { data, error } = await query.order('event_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchAllMaterialTrackingLogs(filters = {}) {
  let query = supabase
    .from('material_tracking_logs')
    .select(`
      *,
      profiles:user_id(name, id),
      material_log_items(*)
    `);

  if (filters.stage) {
    query = query.eq('stage', filters.stage);
  }

  if (filters.userId) {
    query = query.eq('user_id', filters.userId);
  }

  if (filters.dateRange) {
    const { start, end } = filters.dateRange;
    query = query.gte('event_date', start).lte('event_date', end);
  }

  const { data, error } = await query.order('event_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateMaterialTrackingLog(id, updates) {
  const { data, error } = await supabase
    .from('material_tracking_logs')
    .update(updates)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data?.[0];
}

export async function deleteMaterialTrackingLog(id) {
  // First delete all related items
  await supabase
    .from('material_log_items')
    .delete()
    .eq('log_id', id);

  // Then delete the log
  const { error } = await supabase
    .from('material_tracking_logs')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============ MATERIAL LOG ITEMS ============

export async function createMaterialLogItems(items) {
  const { data, error } = await supabase
    .from('material_log_items')
    .insert(items)
    .select();
  if (error) throw error;
  return data || [];
}

export async function updateMaterialLogItem(id, updates) {
  const { data, error } = await supabase
    .from('material_log_items')
    .update(updates)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data?.[0];
}

export async function deleteMaterialLogItems(logId) {
  const { error } = await supabase
    .from('material_log_items')
    .delete()
    .eq('log_id', logId);
  if (error) throw error;
}

// ============ PHOTO UPLOADS TO SUPABASE STORAGE ============

export async function uploadMaterialPhoto(file, folder = 'material-tracking') {
  if (!file) throw new Error('No file provided');

  const maxSizeBytes = 2 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error('Photo must be less than 2MB');
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('material-photos')
    .upload(fileName, file);

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('material-photos')
    .getPublicUrl(data.path);

  return urlData?.publicUrl;
}

// ============ LOCATION HELPERS ============

export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// ============ ANALYTICS & REPORTING ============

export async function getMaterialMovementTimeline(materialId) {
  const { data, error } = await supabase
    .from('material_log_items')
    .select(`
      *,
      material_tracking_logs(
        id,
        stage,
        event_date,
        event_time,
        user_id,
        profiles:user_id(name),
        location_name
      )
    `)
    .eq('material_id', materialId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getMaterialMismatchSummary() {
  const { data, error } = await supabase
    .from('material_log_items')
    .select(`
      *,
      material_tracking_logs(id, stage, event_date, user_id, profiles:user_id(name)),
      material_masters(name, serial_number)
    `)
    .neq('expected_count', 'actual_count');

  if (error) throw error;
  return data || [];
}

export async function getMaterialInventoryStatus() {
  const { data, error } = await supabase
    .from('material_masters')
    .select('*, material_log_items(*, material_tracking_logs(stage))');

  if (error) throw error;
  return data || [];
}
