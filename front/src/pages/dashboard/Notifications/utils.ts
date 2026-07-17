import type { Role, ChannelKey, NotifEvent, Toggles, EventToggle } from './types';
import { NOTIF_EVENTS, CHANNELS } from './constants';

const INITIAL: Record<Role, Partial<Record<ChannelKey, string[]>>> = {
  client:  { telegram: ['c1','c2','c3','c4','c7'], whatsapp: ['c1','c2','c5'], email: ['c4','c9'] },
  trainer: { telegram: ['t1','t2','t3','t4','t5'], email: ['t6','t7'] },
  admin:   { telegram: ['a1','a2','a3','a4','a5','a7'], email: ['a5','a6','a8'], push: ['a1','a3'] },
  owner:   { telegram: ['o1','o2','o3','o4'], email: ['o1','o2','o6'], push: ['o4'] },
};

export function buildInitialToggles(): Toggles {
  const result: Toggles = {};
  (Object.entries(NOTIF_EVENTS) as [Role, NotifEvent[]][]).forEach(([role, events]) => {
    events.forEach(ev => {
      result[ev.id] = {} as Record<ChannelKey, boolean>;
      CHANNELS.forEach(ch => {
        const ids = (INITIAL[role] ?? {})[ch.key] ?? [];
        result[ev.id][ch.key] = ids.includes(ev.id);
      });
    });
  });
  return result;
}

// event_id → role (id-ы уникальны глобально: c1, t1, a1, o1 — по первой букве).
export const EVENT_ROLE: Record<string, Role> = Object.fromEntries(
  (Object.entries(NOTIF_EVENTS) as [Role, NotifEvent[]][]).flatMap(
    ([role, events]) => events.map(ev => [ev.id, role] as const),
  ),
);

// Накладываем сохранённые серверные тумблеры поверх дефолтов.
export function mergeToggles(base: Toggles, server: EventToggle[]): Toggles {
  const result: Toggles = structuredClone(base);
  for (const t of server) {
    const ch = t.channel_key as ChannelKey;
    if (result[t.event_id] && ch in result[t.event_id]) {
      result[t.event_id][ch] = t.is_enabled;
    }
  }
  return result;
}

// Тумблеры, отличающиеся от сохранённых, → плоский список EventToggle для PATCH.
export function diffToggles(next: Toggles, prev: Toggles): EventToggle[] {
  const changes: EventToggle[] = [];
  for (const evId of Object.keys(next)) {
    const role = EVENT_ROLE[evId];
    if (!role) continue;
    for (const ch of Object.keys(next[evId]) as ChannelKey[]) {
      if (next[evId][ch] !== prev[evId]?.[ch]) {
        changes.push({ role, event_id: evId, channel_key: ch, is_enabled: next[evId][ch] });
      }
    }
  }
  return changes;
}
