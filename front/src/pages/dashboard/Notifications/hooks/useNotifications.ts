import { useEffect, useState } from 'react';
import type { ChannelKey, Role, Toggles } from '../types';
import { CHANNELS, ROLES, NOTIF_EVENTS } from '../constants';
import { buildInitialToggles, mergeToggles, diffToggles } from '../utils';
import { notificationsApi } from '../../../../api/notifications';

const DEFAULT_CHANNELS: Record<ChannelKey, boolean> = {
  telegram: true, instagram: false, whatsapp: true, email: true, sms: false, push: false,
};

export function useNotifications() {
  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>(DEFAULT_CHANNELS);
  const [activeRole, setActiveRole] = useState<Role>('client');
  const [toggles, setToggles] = useState<Toggles>(buildInitialToggles);
  const [savedToggles, setSavedToggles] = useState<Toggles>(buildInitialToggles);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([notificationsApi.getSettings(), notificationsApi.getEventToggles()])
      .then(([settings, serverToggles]) => {
        if (cancelled) return;
        setChannels({
          telegram: settings.telegram, instagram: settings.instagram, whatsapp: settings.whatsapp,
          email: settings.email, sms: settings.sms, push: settings.push,
        });
        const merged = mergeToggles(buildInitialToggles(), serverToggles);
        setToggles(merged);
        setSavedToggles(merged);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const isDirty = JSON.stringify(toggles) !== JSON.stringify(savedToggles);

  // Канал сохраняется сразу (оптимистично); при ошибке откатываем.
  const toggleChannel = (key: ChannelKey) => {
    const next = !channels[key];
    setChannels(prev => ({ ...prev, [key]: next }));
    notificationsApi.updateSettings({ [key]: next }).catch((e: unknown) => {
      setChannels(prev => ({ ...prev, [key]: !next }));
      setError(e instanceof Error ? e.message : 'Не удалось сохранить канал');
    });
  };

  const toggleCheck = (evId: string, chKey: ChannelKey) =>
    setToggles(prev => ({
      ...prev,
      [evId]: { ...prev[evId], [chKey]: !prev[evId][chKey] },
    }));

  const switchRole = (role: Role) => {
    if (role === activeRole) return;
    setActiveRole(role);
  };

  const saveChanges = async () => {
    const changes = diffToggles(toggles, savedToggles);
    if (changes.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all(changes.map(c => notificationsApi.updateEventToggle(c)));
      setSavedToggles(toggles);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

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
    loading, error, saving,
  };
}
