import { useNotifications } from './hooks/useNotifications';
import ChannelsSidebar from './components/sections/ChannelsSidebar';
import RolesSelector from './components/sections/RolesSelector';
import NotificationMatrix from './components/sections/NotificationMatrix';

export default function Notifications() {
  const h = useNotifications();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'clamp(240px, 21vw, 280px) 1fr', gap: '24px', alignItems: 'start' }}>
      <ChannelsSidebar channels={h.channels} toggleChannel={h.toggleChannel} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <RolesSelector activeRole={h.activeRole} switchRole={h.switchRole} countActive={h.countActive} />
        <NotificationMatrix
          currentRole={h.currentRole}
          events={h.events}
          activeChannels={h.activeChannels}
          toggles={h.toggles}
          toggleCheck={h.toggleCheck}
          setToggles={h.setToggles}
          isDirty={h.isDirty}
          onSave={h.saveChanges}
          onCancel={h.cancelChanges}
        />
      </div>
    </div>
  );
}
