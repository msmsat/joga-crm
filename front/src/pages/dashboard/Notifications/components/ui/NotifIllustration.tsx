import { Icon } from './NotificationIcons';
import '../../Notifications.module.css';

export default function NotifIllustration() {
  return (
    <div style={{
      position: 'relative',
      height: '160px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderRadius: '16px',
      background: 'linear-gradient(135deg, rgba(252,174,145,0.12) 0%, rgba(74,128,196,0.08) 100%)',
      marginBottom: '24px',
    }}>
      <div style={{
        position: 'absolute',
        width: '180px', height: '180px',
        borderRadius: '50%',
        border: '1.5px solid rgba(249,160,139,0.18)',
        animation: 'notifPulse 3s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute',
        width: '130px', height: '130px',
        borderRadius: '50%',
        border: '1.5px solid rgba(249,160,139,0.25)',
        animation: 'notifPulse 3s ease-in-out infinite 0.5s',
      }} />
      <div style={{
        position: 'absolute',
        width: '80px', height: '80px',
        borderRadius: '50%',
        border: '1.5px solid rgba(249,160,139,0.35)',
        animation: 'notifPulse 3s ease-in-out infinite 1s',
      }} />

      <div style={{
        width: '52px', height: '52px',
        borderRadius: '16px',
        background: 'rgba(249,160,139,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#F9A08B',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(249,160,139,0.3)',
        zIndex: 2,
      }}>
        <Icon.Bell />
      </div>

      {[
        { label: 'Telegram', top: '18px', right: '40px', color: '#4A80C4', delay: '0s' },
        { label: 'WhatsApp', bottom: '18px', right: '30px', color: '#5BAB72', delay: '0.4s' },
        { label: 'Email', top: '28px', left: '28px', color: '#F9A08B', delay: '0.8s' },
        { label: 'SMS', bottom: '28px', left: '40px', color: '#9B8EC4', delay: '1.2s' },
      ].map(chip => (
        <div key={chip.label} style={{
          position: 'absolute',
          top: chip.top, right: (chip as any).right, bottom: chip.bottom, left: (chip as any).left,
          background: '#fff',
          border: `1px solid ${chip.color}30`,
          borderRadius: '20px',
          padding: '4px 10px',
          fontSize: '11px',
          fontWeight: 600,
          color: chip.color,
          fontFamily: 'var(--font)',
          animation: `notifFloat 3s ease-in-out infinite ${chip.delay}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          zIndex: 3,
        }}>
          {chip.label}
        </div>
      ))}
    </div>
  );
}
