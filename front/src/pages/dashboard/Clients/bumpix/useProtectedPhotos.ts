import { useEffect, useState } from 'react';
import type { BumpixPhoto } from '../../../../api/clients/bumpix.types';
import { bumpixApi } from '../../../../api/clients/bumpix.api';
import { getActiveContextKey } from '../../../../utils/auth';
import { loadPhotos } from './photoLoader';
import type { PhotoLoadState } from './photoLoader';

export function useProtectedPhotos(clientId: number, photos: BumpixPhoto[], enabled: boolean) {
  const scope = getActiveContextKey();
  const photoKey = JSON.stringify(photos.map(p => ({ id: p.id, sha256: p.sha256, revision: p.revision })));
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([scope, clientId, photoKey, attempt, enabled]);
  const [state, setState] = useState<PhotoLoadState & { key: string }>({ key: '', urls: [], failed: 0, completed: 0 });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const allocated = new Set<string>();
    const records: Pick<BumpixPhoto, 'id'>[] = JSON.parse(photoKey);
    void loadPhotos(records, {
      signal: controller.signal,
      load: async photo => {
        const body = await bumpixApi.photo(clientId, photo, controller.signal);
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(body.type)
          || body.size === 0 || body.size > 50 * 1024 * 1024) throw new Error('Invalid photo response');
        return body;
      },
      current: () => getActiveContextKey() === scope,
      create: blob => { const url = URL.createObjectURL(blob); allocated.add(url); return url; },
      release: url => { if (allocated.delete(url)) URL.revokeObjectURL(url); },
      update: result => setState({ ...result, key }),
    });
    return () => {
      controller.abort();
      allocated.forEach(url => URL.revokeObjectURL(url));
      allocated.clear();
    };
  }, [clientId, photoKey, scope, enabled, key]);

  const ready = state.key === key && enabled;
  return { urls: ready ? state.urls : [], failed: ready ? state.failed : 0,
    pending: enabled && photos.length > (ready ? state.completed : 0), retry: () => setAttempt(v => v + 1) };
}
