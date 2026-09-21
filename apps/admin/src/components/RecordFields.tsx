'use client';

import { useState } from 'react';
import { fieldLabel } from '../lib/management-tables';
import styles from './management.module.css';

export const textValue = (value: unknown) => value === null || value === undefined || value === '' ? '—' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value);
const sensitive = /passwordhash|tokenhash|accesstoken|refreshtoken|authorization|secret|password$/i;
function safeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? '[redacted]' : safeJson(item)]));
  return value;
}
export function RecordFields({ record, keys = Object.keys(record), omit = [] }: { record: Record<string, unknown>; keys?: string[]; omit?: string[] }) {
  return <dl className={styles['fields']}>
    {keys.filter(key => !omit.includes(key) && !sensitive.test(key)).map(key => {
      const value = record[key];
      return <div key={key}><dt>{fieldLabel(key)}</dt><dd dir={key.endsWith('Ar') ? 'rtl' : 'auto'}>
        {value && typeof value === 'object' ? <pre>{JSON.stringify(safeJson(value), null, 2)}</pre>
          : key.endsWith('At') && typeof value === 'string' ? <time dateTime={value}>{new Date(value).toLocaleString()}</time>
          : textValue(value)}
      </dd></div>;
    })}
  </dl>;
}
export function ErrorNotice({ message, retry }: { message?: string; retry?: () => void }) {
  return message ? <div role="alert" className={styles['error']}>{message} {retry && <button type="button" onClick={retry}>Retry</button>}</div> : null;
}
export function PreviewImage({ reference, url }: { reference: string; url?: string }) {
  const [failed, setFailed] = useState(false);
  const source = url || (/^https?:\/\//i.test(reference) ? reference : undefined);
  return <figure>
    {source && !failed ? <a href={source} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={source} alt="Product or category image" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </a> : <p>{failed ? 'Image unavailable' : 'Preview unavailable'}</p>}
    <figcaption>{reference}</figcaption>
  </figure>;
}
