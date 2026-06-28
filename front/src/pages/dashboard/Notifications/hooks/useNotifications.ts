import { useState } from 'react';
import type { ChannelKey, Role, Toggles } from '../types';
import { CHANNELS, ROLES, NOTIF_EVENTS } from '../constants';
import { buildInitialToggles } from '../utils';

export function useNotifications() {
  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>({
    telegram: true, instagram: false, whatsapp: true, email: true, sms: false, push: false,
  });
  const [activeRole, setActiveRole] = useState<Role>('client');
  const [toggles, setToggles] = useState<Toggles>(buildInitialToggles);
  const [savedToggles, setSavedToggles] = useState<Toggles>(buildInitialToggles);

  const isDirty = JSON.stringify(toggles) !== JSON.stringify(savedToggles);

  const toggleChannel = (key: ChannelKey) =>
    setChannels(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleCheck = (evId: string, chKey: ChannelKey) =>
    setToggles(prev => ({
      ...prev,
      [evId]: { ...prev[evId], [chKey]: !prev[evId][chKey] },
    }));

  const switchRole = (role: Role) => {
    if (role === activeRole) return;
    setActiveRole(role);
  };

  const saveChanges = () => setSavedToggles(toggles);

  const cancelChanges = () => setToggles(savedToggles);

  const countActive = (role: Role) =>
    NOTIF_EVENTS[role].reduce((sum, ev) => {
      const hasActive = CHANNELS.some(ch => channels[ch.key] && toggles[ev.id]?.[ch.key]);
      return sum + (hasActive ? 1 : 0);
    }, 0);

  const currentRole = ROLES.find(r => r.key === activeRole)!;
  const events = NOTIF_EVENTS[activeRole];
  const activeChannels = CHANNELS.filter(c => channels[c.key]);

  return {
    channels, toggleChannel,
    activeRole, switchRole, countActive,
    currentRole, events, activeChannels,
    toggles, toggleCheck, setToggles,
    isDirty, saveChanges, cancelChanges,
  };
}
