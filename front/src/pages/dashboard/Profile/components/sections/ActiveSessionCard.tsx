import type { UserAccount } from '../../types';

interface Props {
  accounts: UserAccount[];
}

export default function ActiveSessionCard({ accounts }: Props) {
  return (
    <div style={{
      padding: '32px', borderRadius: '24px',
      background: 'linear-gradient(135deg, #111111 0%, #1e1e24 100%)',
      color: 'white', position: 'relative', overflow: 'hidden',
      boxShadow: '0 24px 48px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05)',
    }}>
      <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', background: 'radial-gradient(circle, rgba(252,174,145,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {accounts.filter(a => a.active).map(activeAcc => (
        <div key={activeAcc.id} style={{ display: 'flex', alignItems: 'center', gap: '24px', position: 'relative', zIndex: 1 }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '20px',
            background: `linear-gradient(135deg, ${activeAcc.color}, #f5887a)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', fontWeight: 800, color: 'white',
            boxShadow: `0 12px 24px ${activeAcc.color}40`, flexShrink: 0,
          }}>
            {activeAcc.name.split(' ').map(n => n[0]).join('')}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'inline-block', padding: '4px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '100px', fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.9)', marginBottom: '10px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Текущая сессия
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '4px', letterSpacing: '-0.5px' }}>{activeAcc.name}</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {activeAcc.email}
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
              {activeAcc.role}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
