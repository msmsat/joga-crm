import { client } from '../../../../api/client';
import { validateRangePage } from './model';
import type { SourceJournalItem, SourceJournalPage } from './types';

export async function sourceRange(from: string, to: string, signal?: AbortSignal) {
  const items: SourceJournalItem[] = [], ids = new Set<number>();
  let total: number | undefined, offset = 0;
  do {
    const params = new URLSearchParams({date_from:from,date_to:to,offset:String(offset),limit:'200'});
    const page = validateRangePage(await client.get<SourceJournalPage>(`/schedule/bumpix-events?${params}`, {signal}), offset);
    if (total !== undefined && total !== page.total) throw new Error('Source journal changed during paging; reload');
    total = page.total;
    for (const item of page.items) {
      if (ids.has(item.event.id)) throw new Error('Duplicate source journal record; reload');
      ids.add(item.event.id); items.push(item);
    }
    offset += page.items.length;
  } while (offset < total);
  return items;
}
export function sourceDays(month: string, excluded: number[], signal?: AbortSignal) {
  const params = new URLSearchParams({month:month+'-01',exclude_teacher_ids:excluded.filter(i=>i>0).join(','),exclude_unmapped:String(excluded.includes(-1))});
  return client.get<string[]>(`/schedule/bumpix-days?${params}`, {signal});
}
export const sourceDetail = (lessonId: number, signal?: AbortSignal) => client.get<SourceJournalItem | null>(`/schedule/lessons/${lessonId}/bumpix`, {signal});
