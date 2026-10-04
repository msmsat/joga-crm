import type { BumpixEvent } from '../../../../api/clients/bumpix.types';
export interface SourceJournalItem { event: BumpixEvent; client_id: number; client_name: string; master_name: string }
export interface SourceJournalPage { total: number; offset: number; limit: number; items: SourceJournalItem[] }
