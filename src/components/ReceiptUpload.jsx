import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { validateReceiptFile } from '../utils/validation';

export default function ReceiptUpload({ userId, onUploaded, currentUrl, required }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(currentUrl || null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const upload = async (file) => {
    const validation = validateReceiptFile(file);
    if (!validation.ok) { toast.error(validation.message); return; }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('receipts').upload(path, file, { upsert: false });
    setUploading(false);

    if (error) { toast.error(error.message); return; }

    const { data } = supabase.storage.from('receipts').getPublicUrl(path);
    setPreview(data.publicUrl);
    onUploaded(data.publicUrl);
    toast.success('Receipt uploaded');
  };

  const handleFile = (e) => { const f = e.target.files?.[0]; if (f) upload(f); };
  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0]; if (f) upload(f);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Receipt Image {required && <span className="text-red-500">*</span>}
      </label>

      {preview ? (
        <div className="relative inline-block">
          <img src={preview} alt="receipt" className="h-28 w-auto rounded-xl border border-slate-200 object-cover shadow dark:border-slate-700" />
          <button
            type="button"
            onClick={() => { setPreview(null); onUploaded(''); if (inputRef.current) inputRef.current.value = ''; }}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition
            ${drag ? 'border-teal bg-teal/5' : 'border-slate-200 hover:border-teal/50 hover:bg-slate-50 dark:border-slate-600 dark:hover:border-teal/50 dark:hover:bg-slate-800'}`}
        >
          {uploading ? (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-teal" />
          ) : (
            <>
              <svg className="h-8 w-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-xs text-slate-400">Drop image here or <span className="font-semibold text-teal">browse</span></p>
              <p className="text-[10px] text-slate-300">JPG / PNG · max 5 MB</p>
            </>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/png,image/jpeg" onChange={handleFile} className="hidden" />
    </div>
  );
}
