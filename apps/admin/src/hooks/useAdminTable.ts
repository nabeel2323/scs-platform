'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { adminRequest, AdminTableQuery } from '../lib/api';
import { ManagementConfig } from '../lib/management-tables';

export function useAdminTableQuery(config: ManagementConfig) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const serialized = params.toString();
  const latest = useRef(serialized);
  latest.current = serialized;
  const applied = useMemo(() => {
    const input = new URLSearchParams(serialized);
    const result: Record<string, string> = {};
    for (const key of ['search', 'page', 'limit', 'sortBy', 'sortDir', 'dateField', 'from', 'to', ...config.filters.map(f => f.key)]) {
      const value = input.get(key);
      if (value) result[key] = value;
    }
    if (!result['storeId'] && input.get('store')) result['storeId'] = input.get('store')!;
    return result;
  }, [serialized, config]);
  const [search, setSearch] = useState(applied['search'] || '');
  const [draft, setDraft] = useState(applied);
  useEffect(() => { setSearch(applied['search'] || ''); setDraft(applied); }, [applied]);
  const change = useCallback((patch: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(latest.current);
    if (!next.has('storeId') && next.get('store')) next.set('storeId', next.get('store')!);
    next.delete('store');
    for (const [key, value] of Object.entries(patch)) value ? next.set(key, value) : next.delete(key);
    if (resetPage) next.delete('page');
    latest.current = next.toString();
    router.replace(`${pathname}${latest.current ? '?' + latest.current : ''}`, { scroll: false });
  }, [pathname, router]);
  useEffect(() => {
    if (search === (applied['search'] || '')) return;
    const timer = setTimeout(() => change({ search: search.trim() }), 300);
    return () => clearTimeout(timer);
  }, [search, applied, change]);
  const pageValue = Number(applied['page'] || 0);
  const page = Number.isSafeInteger(pageValue) && pageValue >= 0 ? pageValue : 0;
  const limitValue = Number(applied['limit'] || 25);
  const limit = [10, 25, 50, 100].includes(limitValue) ? limitValue : 25;
  const sortBy = applied['sortBy'] || config.defaultSort || 'createdAt';
  const sortDir = applied['sortDir'] || config.defaultDirection || 'desc';
  const query: AdminTableQuery = { ...applied, limit, offset: page * limit, sortBy, sortDir };
  delete query['page'];
  const apply = () => {
    const values: Record<string, string> = { search: search.trim() };
    for (const key of [...config.filters.map(f => f.key), 'dateField', 'from', 'to']) values[key] = draft[key] || '';
    change(values);
  };
  const reset = () => {
    setSearch(''); setDraft({}); latest.current = '';
    router.replace(pathname, { scroll: false });
  };
  return { query, page, limit, sortBy, sortDir, search, setSearch, draft, setDraft, apply, reset, change, applied,
    returnTo: `${pathname}${serialized ? '?' + serialized : ''}` };
}

/** A URL-keyed resource never exposes a previous record while a new one loads. */
export function useAdminResource<T>(path: string | null, enabled = true) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: string; loading: boolean }>({ key: '', loading: true });
  const key = `${path}:${revision}`;
  useEffect(() => {
    if (!enabled || !path) return;
    const controller = new AbortController();
    setState({ key, loading: true });
    adminRequest<T>(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ key, data, loading: false });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Request failed', loading: false });
    });
    return () => controller.abort();
  }, [path, enabled, key]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const current = enabled && state.key === key ? state : { loading: !!path && enabled, data: undefined, error: undefined };
  return { ...current, reload };
}
