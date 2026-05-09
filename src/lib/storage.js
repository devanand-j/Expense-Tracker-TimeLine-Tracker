import { AwsClient } from 'aws4fetch';
import { supabase } from './supabaseClient';

const storageProvider = (import.meta.env.VITE_STORAGE_PROVIDER || '').trim().toLowerCase();
const r2AccountId = (import.meta.env.VITE_R2_ACCOUNT_ID || '').trim();
const r2AccessKeyId = (import.meta.env.VITE_R2_ACCESS_KEY_ID || '').trim();
const r2SecretAccessKey = (import.meta.env.VITE_R2_SECRET_ACCESS_KEY || '').trim();
const r2Bucket = (import.meta.env.VITE_R2_BUCKET_NAME || '').trim();
const r2PublicBaseUrl = (import.meta.env.VITE_R2_PUBLIC_BASE_URL || '').trim();
const r2Endpoint = (import.meta.env.VITE_R2_ENDPOINT || (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : '')).trim();

const hasR2Config = Boolean(r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket && r2Endpoint);
const activeProvider = storageProvider || (hasR2Config ? 'r2' : 'supabase');

const r2Client = hasR2Config
  ? new AwsClient({
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
      service: 's3',
      region: 'auto'
    })
  : null;

function normalizeFileName(fileName) {
  return String(fileName || 'file')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

function encodeObjectKey(path) {
  return String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildBasePublicUrl(baseUrl) {
  if (!baseUrl) return '';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function resolveBucketName(bucket) {
  return bucket || r2Bucket;
}

export function buildStorageObjectPath(file, { folder = 'uploads', userId = '', fileName } = {}) {
  const originalName = fileName || file?.name || 'file';
  const sanitizedName = normalizeFileName(originalName);
  const extension = sanitizedName.includes('.') ? sanitizedName.split('.').pop() : 'bin';
  const nameWithoutExtension = sanitizedName.includes('.') ? sanitizedName.slice(0, sanitizedName.lastIndexOf('.')) : sanitizedName;
  const prefixParts = [folder, userId].filter(Boolean).map((part) => normalizeFileName(part));
  return `${prefixParts.join('/')}${prefixParts.length ? '/' : ''}${nameWithoutExtension}-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
}

export function isR2StorageEnabled() {
  return activeProvider === 'r2' && Boolean(r2Client);
}

export function getStoredFilePublicUrl(path, bucket) {
  if (!path) return null;

  if (isR2StorageEnabled()) {
    const baseUrl = buildBasePublicUrl(r2PublicBaseUrl);
    if (!baseUrl) {
      return `${r2Endpoint}/${resolveBucketName(bucket)}/${encodeObjectKey(path)}`;
    }

    return new URL(encodeObjectKey(path), baseUrl).toString();
  }

  const { data } = supabase.storage.from(resolveBucketName(bucket)).getPublicUrl(path);
  return data?.publicUrl || null;
}

export async function getStoredFileUrl(path, bucket, { signed = false, expiresIn = 60 } = {}) {
  if (!path) return null;

  if (isR2StorageEnabled()) {
    return getStoredFilePublicUrl(path, bucket);
  }

  if (signed) {
    const { data, error } = await supabase.storage.from(resolveBucketName(bucket)).createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data?.signedUrl || null;
  }

  return getStoredFilePublicUrl(path, bucket);
}

export async function uploadStoredFile(file, {
  bucket,
  folder = 'uploads',
  userId = '',
  path,
  upsert = false,
  contentType
} = {}) {
  if (!file) throw new Error('No file provided');

  const resolvedBucket = resolveBucketName(bucket);
  const objectPath = path || buildStorageObjectPath(file, { folder, userId });
  const mimeType = contentType || file.type || 'application/octet-stream';

  if (isR2StorageEnabled()) {
    if (!r2Client) throw new Error('Cloudflare R2 is not configured');

    const endpointUrl = `${r2Endpoint}/${resolvedBucket}/${encodeObjectKey(objectPath)}`;
    const response = await r2Client.fetch(endpointUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': mimeType
      }
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(responseText || `Failed to upload file (${response.status})`);
    }

    return {
      path: objectPath,
      publicUrl: getStoredFilePublicUrl(objectPath, resolvedBucket),
      bucket: resolvedBucket,
      provider: 'r2'
    };
  }

  const { data, error } = await supabase.storage
    .from(resolvedBucket)
    .upload(objectPath, file, { upsert, contentType: mimeType });

  if (error) throw error;

  return {
    path: data?.path || objectPath,
    publicUrl: getStoredFilePublicUrl(data?.path || objectPath, resolvedBucket),
    bucket: resolvedBucket,
    provider: 'supabase'
  };
}

export async function deleteStoredFile(path, bucket) {
  if (!path) return;

  const resolvedBucket = resolveBucketName(bucket);

  if (isR2StorageEnabled()) {
    if (!r2Client) throw new Error('Cloudflare R2 is not configured');

    const endpointUrl = `${r2Endpoint}/${resolvedBucket}/${encodeObjectKey(path)}`;
    const response = await r2Client.fetch(endpointUrl, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      const responseText = await response.text().catch(() => '');
      throw new Error(responseText || `Failed to delete file (${response.status})`);
    }
    return;
  }

  const { error } = await supabase.storage.from(resolvedBucket).remove([path]);
  if (error) throw error;
}