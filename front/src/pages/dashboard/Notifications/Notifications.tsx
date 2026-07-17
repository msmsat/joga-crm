import { useNotifications } from './hooks/useNotifications';
import ChannelsSidebar from './components/sections/ChannelsSidebar';
import RolesSelector from './components/sections/RolesSelector';
import NotificationMatrix from './components/sections/NotificationMatrix';

export default function Notifications() {
  const h = useNotifications();

  if (h.loading) {
    return <div style={{ padding: '60px 24px', textAlign: 'center', color: '#666666', fontSize: '14px' }}>Загрузка…</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'clamp(240px, 21vw, 280px) 1fr', gap: '24px', alignItems: 'start' }}>
      <ChannelsSidebar channels={h.channels} toggleChannel={h.toggleChannel} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {h.error && (
          <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(216,140,154,0.1)', color: '#D88C9A', fontSize: '13px', fontWeight: 600 }}>
            {h.error}
          </div>
        )}
        <RolesSelector activeRole={h.activeRole} switchRole={h.switchRole} countActive={h.countActive} />
        <NotificationMatrix
          currentRole={h.currentRole}
          events={h.events}
          activeChannels={h.activeChannels}
          toggles={h.toggles}
          toggleCheck={h.toggleCheck}
          setToggles={h.setToggles}
          isDirty={h.isDirty}
          saving={h.saving}
          onSave={h.saveChanges}
          onCancel={h.cancelChanges}
        />
      </div>
    </div>
  );
}
