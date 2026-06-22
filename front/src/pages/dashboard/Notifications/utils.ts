import type { Role, ChannelKey, NotifEvent, Toggles } from './types';
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
