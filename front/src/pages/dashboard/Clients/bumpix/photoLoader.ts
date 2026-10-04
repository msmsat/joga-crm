export interface PhotoLoadState { urls: (string | null)[]; failed: number; completed: number }

interface Options<Id, Body> {
  signal: AbortSignal;
  load: (id: Id) => Promise<Body>;
  current: () => boolean;
  create: (body: Body) => string;
  release: (url: string) => void;
  update: (state: PhotoLoadState) => void;
}

/** Two simultaneous requests, stable order, explicit failures and cancellation. */
export async function loadPhotos<Id, Body>(ids: Id[], options: Options<Id, Body>): Promise<PhotoLoadState> {
  const result: PhotoLoadState = { urls: ids.map(() => null), failed: 0, completed: 0 };
  let next = 0;
  const live = () => !options.signal.aborted && options.current();
  const worker = async () => {
    while (live() && next < ids.length) {
      const index = next++;
      try {
        const body = await options.load(ids[index]);
        if (!live()) return;
        result.urls[index] = options.create(body);
      } catch {
        if (!live()) return;
        result.failed++;
      }
      result.completed++;
      options.update({ ...result, urls: [...result.urls] });
    }
  };
  await Promise.all([worker(), worker()]);
  if (!live()) result.urls.forEach(url => { if (url) options.release(url); });
  return result;
}
