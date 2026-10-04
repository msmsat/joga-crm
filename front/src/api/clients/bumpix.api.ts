import { client } from '../client';
import type { BumpixEventPage, BumpixFilter, BumpixPhoto, BumpixProfile } from './bumpix.types';

export const bumpixApi = {
  profiles: (id: number, signal?: AbortSignal) =>
    client.get<BumpixProfile[]>(`/clients/${id}/bumpix`, { signal }),
  events: (id: number, filter: BumpixFilter, offset: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ status: filter, offset: String(offset), limit: '25' });
    return client.get<BumpixEventPage>(`/clients/${id}/bumpix/events?${params}`, { signal });
  },
  // Never load a URL received from source JSON or put a token into an image URL.
  photo: (id: number, photo: Pick<BumpixPhoto, 'id'>, signal?: AbortSignal) =>
    client.blob(`/clients/${id}/bumpix/media/${photo.id}`, { signal }),
};
