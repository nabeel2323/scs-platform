'use client';

import { type StudioState } from '../../../../hooks/useProductStudio';
import { StepCard, Field } from './StepIdentity';

interface StepMediaProps {
  state: StudioState;
  setState: React.Dispatch<React.SetStateAction<StudioState>>;
}

export default function StepMedia({ state, setState }: StepMediaProps) {
  const addImageUrl = (url: string) => {
    if (!url.trim()) return;
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

  const removeImage = (index: number) => {
    setState(prev => {
      const items = prev.mediaItems.filter((_, j) => j !== index);
      // Ensure at least one is primary
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
      return { ...prev, mediaItems: items };
    });
  };

  return (
    <StepCard title="Product Media" subtitle="Upload images for your product. Drag to reorder. Set a primary image.">
      {/* URL input */}
      <Field label="Add Image URL">
        <input
          placeholder="https://example.com/image.jpg"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              addImageUrl((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = '';
            }
          }}
        />
        <span style={{ fontSize: 11, color: '#5b6b74' }}>Press Enter to add. Supports JPG, PNG, WebP.</span>
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
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none',
                    borderRadius: 4, cursor: 'pointer', fontSize: 12, padding: '2px 6px',
                  }}
                  aria-label={`Remove image ${i + 1}`}
                >×</button>

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

      {state.mediaItems.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', border: '2px dashed #d9e2e6', borderRadius: 8, color: '#5b6b74' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🖼</div>
          <div style={{ fontSize: 13 }}>No images yet. Add image URLs above.</div>
        </div>
      )}
    </StepCard>
  );
}
