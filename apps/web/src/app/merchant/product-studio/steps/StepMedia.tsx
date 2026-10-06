'use client';

import { useState, useRef } from 'react';
import { type StudioState } from '../../../../hooks/useProductStudio';
import { presignMedia } from '../../../../lib/buyer-api';
import { StepCard, Field } from './StepIdentity';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGES = 20;

interface UploadState {
  progress: number; // 0-100
  status: 'uploading' | 'success' | 'error';
  error?: string;
  fileName: string;
}

interface StepMediaProps {
  state: StudioState;
  setState: React.Dispatch<React.SetStateAction<StudioState>>;
  /** PHASE 4 P6 — Edit mode for media management. */
  editMode?: boolean;
  productId?: string;
  existingMedia?: Array<{ id: string; url: string; displayUrl?: string | null; altText: string | null; sortOrder: number; mediaType: string }>;
}

export default function StepMedia({ state, setState }: StepMediaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const addImageUrl = (url: string) => {
    if (!url.trim()) return;
    if (state.mediaItems.length >= MAX_IMAGES) return;
    setState(prev => ({
      ...prev,
      mediaItems: [...prev.mediaItems, {
        storageKey: '',
        url: url.trim(),
        altText: '',
        isPrimary: prev.mediaItems.length === 0,
      }],
    }));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = ''; // reset for re-selection

    for (const file of files) {
      if (state.mediaItems.length + uploads.filter(u => u.status === 'success').length >= MAX_IMAGES) {
        break;
      }

      // Validate MIME
      if (!ALLOWED_MIME.includes(file.type)) {
        setUploads(prev => [...prev, {
          progress: 0, status: 'error', fileName: file.name,
          error: `Invalid type: ${file.type}. Use JPG, PNG, or WebP.`,
        }]);
        continue;
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        setUploads(prev => [...prev, {
          progress: 0, status: 'error', fileName: file.name,
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`,
        }]);
        continue;
      }

      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    const uploadIdx = uploads.length;
    setUploads(prev => [...prev, { progress: 0, status: 'uploading', fileName: file.name }]);

    try {
      // Step 1: Get presigned URL
      const { uploadUrl, storageKey } = await presignMedia({
        fileName: file.name,
        mimeType: file.type,
      });

      // Step 2: Upload file via PUT
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploads(prev => prev.map((u, i) => i === uploadIdx ? { ...u, progress: pct } : u));
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        });
        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Step 3: Build public URL from storage key
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
      const publicUrl = `${apiUrl}/v1/media/${storageKey}`;

      // Step 4: Add to media items
      setState(prev => ({
        ...prev,
        mediaItems: [...prev.mediaItems, {
          storageKey,
          url: publicUrl,
          altText: '',
          isPrimary: prev.mediaItems.length === 0,
        }],
      }));

      setUploads(prev => prev.map((u, i) => i === uploadIdx ? { ...u, progress: 100, status: 'success' } : u));
    } catch (err) {
      setUploads(prev => prev.map((u, i) => i === uploadIdx ? {
        ...u, status: 'error' as const, error: err instanceof Error ? err.message : 'Upload failed',
      } : u));
    }
  };

  const retryUpload = async (file: File, uploadIdx: number) => {
    setUploads(prev => prev.map((u, i) => i === uploadIdx ? { ...u, status: 'uploading', progress: 0, error: undefined } : u));
    await uploadFile(file);
  };

  const removeImage = (index: number) => {
    setConfirmDelete(null);
    setState(prev => {
      const items = prev.mediaItems.filter((_, j) => j !== index);
      // Ensure at least one is primary (lowest sort_order = first item)
      if (items.length > 0 && !items.some(m => m.isPrimary)) {
        items[0]!.isPrimary = true;
      }
      return { ...prev, mediaItems: items };
    });
  };

  const setPrimary = (index: number) => {
    setState(prev => ({
      ...prev,
      mediaItems: prev.mediaItems.map((item, j) => ({
        ...item,
        isPrimary: j === index,
      })),
    }));
  };

  const updateAlt = (index: number, altText: string) => {
    setState(prev => ({
      ...prev,
      mediaItems: prev.mediaItems.map((item, j) => j === index ? { ...item, altText } : item),
    }));
  };

  const moveImage = (from: number, direction: -1 | 1) => {
    const to = from + direction;
    setState(prev => {
      const items = [...prev.mediaItems];
      if (to < 0 || to >= items.length) return prev;
      const tmp = items[from]!;
      items[from] = items[to]!;
      items[to] = tmp;
      // Update primary: first item is primary
      const updated = items.map((item, j) => ({ ...item, isPrimary: j === 0 }));
      return { ...prev, mediaItems: updated };
    });
  };

  return (
    <StepCard title="Product Media" subtitle="Upload images or add URLs. Reorder with arrows. First image is primary.">
      {/* File upload */}
      <div style={{ marginBottom: 12 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={state.mediaItems.length >= MAX_IMAGES}
          style={{
            padding: '8px 16px', fontSize: 13, border: '1px solid #0f3340',
            borderRadius: 6, cursor: state.mediaItems.length >= MAX_IMAGES ? 'not-allowed' : 'pointer',
            background: '#0f3340', color: '#fff', fontWeight: 600,
            opacity: state.mediaItems.length >= MAX_IMAGES ? 0.5 : 1,
          }}
        >
          Upload Images
        </button>
        <span style={{ fontSize: 11, color: '#5b6b74', marginLeft: 8 }}>
          JPG, PNG, WebP — max 5 MB each — {state.mediaItems.length}/{MAX_IMAGES}
        </span>
      </div>

      {/* Upload progress */}
      {uploads.filter(u => u.status === 'uploading' || u.status === 'error').length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {uploads.map((u, i) => (
            (u.status === 'uploading' || u.status === 'error') && (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.fileName}</span>
                {u.status === 'uploading' && (
                  <>
                    <div style={{ width: 80, height: 6, background: '#e5ecf0', borderRadius: 3 }}>
                      <div style={{ width: `${u.progress}%`, height: '100%', background: '#0f3340', borderRadius: 3, transition: 'width 0.2s' }} />
                    </div>
                    <span>{u.progress}%</span>
                  </>
                )}
                {u.status === 'error' && (
                  <span style={{ color: '#c0392b' }}>{u.error}</span>
                )}
              </div>
            )
          ))}
        </div>
      )}

      {/* URL input */}
      <Field label="Or add image URL">
        <input
          placeholder="https://example.com/image.jpg"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              addImageUrl((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = '';
            }
          }}
        />
      </Field>

      {/* Image grid */}
      {state.mediaItems.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#16232b', marginBottom: 8 }}>
            {state.mediaItems.length} image(s) added
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {state.mediaItems.map((item, i) => (
              <div key={i} style={{
                border: item.isPrimary ? '2px solid #0f3340' : '1px solid #d9e2e6',
                borderRadius: 8, overflow: 'hidden', position: 'relative',
              }}>
                <img
                  src={item.url}
                  alt={item.altText || `Image ${i + 1}`}
                  style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
                />
                {item.isPrimary && (
                  <span style={{
                    position: 'absolute', top: 4, left: 4,
                    background: '#0f3340', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                  }}>Primary</span>
                )}
                {confirmDelete === i ? (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span style={{ color: '#fff', fontSize: 11 }}>Delete?</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" onClick={() => removeImage(i)}
                        style={{ padding: '2px 8px', fontSize: 10, border: 'none', borderRadius: 4, cursor: 'pointer', background: '#c0392b', color: '#fff' }}>Yes</button>
                      <button type="button" onClick={() => setConfirmDelete(null)}
                        style={{ padding: '2px 8px', fontSize: 10, border: 'none', borderRadius: 4, cursor: 'pointer', background: '#5b6b74', color: '#fff' }}>No</button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(i)}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none',
                      borderRadius: 4, cursor: 'pointer', fontSize: 12, padding: '2px 6px',
                    }}
                    aria-label={`Remove image ${i + 1}`}
                  >×</button>
                )}

                <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input
                    placeholder="Alt text"
                    value={item.altText}
                    onChange={e => updateAlt(i, e.target.value)}
                    style={{ padding: '4px 6px', fontSize: 11, border: '1px solid #e5ecf0', borderRadius: 4, width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: 4 }}>
                    {!item.isPrimary && (
                      <button type="button" onClick={() => setPrimary(i)}
                        style={{ flex: 1, padding: '3px 6px', fontSize: 10, border: '1px solid #d9e2e6', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
                        Set Primary
                      </button>
                    )}
                    <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0}
                      style={{ padding: '3px 6px', fontSize: 10, border: '1px solid #d9e2e6', borderRadius: 4, cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.3 : 1, background: '#fff' }}>↑</button>
                    <button type="button" onClick={() => moveImage(i, 1)} disabled={i === state.mediaItems.length - 1}
                      style={{ padding: '3px 6px', fontSize: 10, border: '1px solid #d9e2e6', borderRadius: 4, cursor: i === state.mediaItems.length - 1 ? 'not-allowed' : 'pointer', opacity: i === state.mediaItems.length - 1 ? 0.3 : 1, background: '#fff' }}>↓</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.mediaItems.length === 0 && uploads.filter(u => u.status === 'uploading').length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', border: '2px dashed #d9e2e6', borderRadius: 8, color: '#5b6b74' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🖼</div>
          <div style={{ fontSize: 13 }}>No images yet. Upload files or add image URLs above.</div>
        </div>
      )}
    </StepCard>
  );
}
