import { useEffect, useRef, useState } from 'react';
import { client, resolveImageUrl } from '../../api/client';
import { getActiveContextKey } from '../../utils/auth';
import { privateMediaPath, ownedMediaPath } from './mediaPaths';
import { loadPhotos, type PhotoLoadState } from './photoLoader';

/** Authenticated photos are fetched only when their gallery enters the viewport. */
export function useMediaSources(paths: string[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [attempt, setAttempt] = useState(0);
  const scope = getActiveContextKey();
  const photoKey = JSON.stringify(paths.filter(ownedMediaPath));
  const key = JSON.stringify([scope, photoKey, attempt]);
  const [state, setState] = useState<PhotoLoadState & { key: string }>({ key: '', urls: [], failed: 0, completed: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '150px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [photoKey]);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    const allocated = new Set<string>();
    const privatePaths: string[] = JSON.parse(photoKey).filter(privateMediaPath);
    void loadPhotos(privatePaths, {
      signal: controller.signal,
      load: async path => {
        const body = await client.blob(path, { signal: controller.signal });
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(body.type)
          || body.size === 0 || body.size > 50 * 1024 * 1024) throw new Error('Invalid photo');
        return body;
      },
      current: () => getActiveContextKey() === scope,
      create: body => { const url = URL.createObjectURL(body); allocated.add(url); return url; },
      release: url => { if (allocated.delete(url)) URL.revokeObjectURL(url); },
      update: result => setState({ ...result, key }),
    });
    return () => { controller.abort(); allocated.forEach(URL.revokeObjectURL); allocated.clear(); };
  }, [visible, photoKey, scope, key]);
  const safe: string[] = JSON.parse(photoKey);
  const privatePaths = safe.filter(privateMediaPath);
  const ready = state.key === key;
  const sources = new Map(safe.map(path => [path, privateMediaPath(path)
    ? ready ? state.urls[privatePaths.indexOf(path)] ?? null : null
    : resolveImageUrl(path) ?? null]));
  return { ref, sources, failed: ready ? state.failed : 0,
    pending: privatePaths.length > (ready ? state.completed : 0), retry: () => setAttempt(n => n + 1) };
}
