import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Глобальная модалка «Достигнут лимит тарифа». Слушает событие velora:plan-limit,
// которое диспатчит api/client.ts при 403 limit_exceeded — так любое место создания
// (сотрудник, клиент) получает апселл без своей обработки ошибки.
export default function PlanLimitModal() {
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onLimit = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      setMessage(detail?.message || 'Достигнут лимит вашего тарифа.');
    };
    window.addEventListener('velora:plan-limit', onLimit);
    return () => window.removeEventListener('velora:plan-limit', onLimit);
  }, []);

  if (message === null) return null;

  const close = () => setMessage(null);
  const upgrade = () => { close(); navigate('/dashboard/billing'); };

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(26,26,26,0.32)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        animation: 'velora-plan-fade 0.2s ease',
      }}
    >
      <style>{`
        @keyframes velora-plan-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes velora-plan-pop { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '420px',
          background: 'var(--bg-card, #FFFFFF)', color: 'var(--text, #1A1A1A)',
          borderRadius: '16px', padding: '32px',
          boxShadow: '0 24px 48px -12px rgba(26,26,26,0.28)',
          textAlign: 'center', animation: 'velora-plan-pop 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        <div style={{
          width: '56px', height: '56px', margin: '0 auto 20px', borderRadius: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #FCAE91, #F9A08B)',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
          </svg>
        </div>

        <div style={{ fontSize: '19px', fontWeight: 800, letterSpacing: '-0.3px', marginBottom: '10px' }}>
          Достигнут лимит тарифа
        </div>
        <div style={{ fontSize: '14px', color: 'var(--muted, #666666)', lineHeight: 1.55, marginBottom: '28px' }}>
          {message} Улучшите тариф, чтобы продолжить.
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={close}
            style={{
              flex: 1, height: '46px', borderRadius: '10px', cursor: 'pointer',
              border: '1.5px solid rgba(26,26,26,0.1)', background: 'transparent',
              color: 'var(--muted, #666666)', fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font)',
            }}
          >
            Позже
          </button>
          <button
            onClick={upgrade}
            style={{
              flex: 1.4, height: '46px', borderRadius: '10px', cursor: 'pointer', border: 'none',
              background: 'linear-gradient(135deg, #FCAE91, #F9A08B)', color: '#FFFFFF',
              fontSize: '14px', fontWeight: 800, fontFamily: 'var(--font)',
              boxShadow: '0 6px 16px rgba(249,160,139,0.4)',
            }}
          >
            Улучшить тариф
          </button>
        </div>
      </div>
    </div>
  );
}
