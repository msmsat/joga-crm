export type BumpixFilter = 'all' | 'all_source' | 'new' | 'completed' | 'canceled' | 'history' | 'online';

export interface BumpixPhoto {
  id: number;
  kind: string;
  source_owner_id: string;
  image_id: string;
  revision: string;
  sha256: string;
  bytes: number;
  url: string;
}

/** Source objects remain open: unknown Bumpix fields must survive migration. */
export interface BumpixProfile {
  source_client_id: string;
  snapshot_id: string;
  profile: Record<string, unknown>;
  raw_client: Record<string, unknown>;
  lookups: Record<string, unknown>;
  counts: Record<string, number>;
  avatar: BumpixPhoto | null;
  imported_at: string;
}

export interface BumpixEvent {
  id: number;
  source_event_id: string;
  source_client_id: string;
  master_source_id: string;
  teacher_user_id: number | null;
  start_time: string;
  end_time: string;
  status: string;
  source_groups: string[];
  details: Record<string, unknown>;
  raw_event: Record<string, unknown>;
  photos: BumpixPhoto[];
}

export interface BumpixEventPage {
  total: number;
  offset: number;
  limit: number;
  items: BumpixEvent[];
}
