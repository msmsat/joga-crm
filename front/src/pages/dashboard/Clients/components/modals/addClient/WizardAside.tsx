import { useTranslation } from 'react-i18next';
import { nameInitials } from '../../../utils/mapClient';

// Левая панель мастера на большом экране: шаг, прогресс и иллюстрация шага.
// На планшете сплющивается в строку «шаг + точки» (.v-modal-steps в App.css),
// на телефоне мастера нет вовсе — там одна форма.

function IllusStep1({ name }: { name: string }) {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r="68" fill="rgba(252,174,145,0.08)" stroke="rgba(252,174,145,0.2)" strokeWidth="1"/>
      <circle cx="70" cy="54" r="26" fill="rgba(252,174,145,0.18)" stroke="rgba(252,174,145,0.4)" strokeWidth="1.5"/>
      <text x="70" y="62" textAnchor="middle" fill="#FCAE91" fontSize="18" fontWeight="800" fontFamily="Manrope">{nameInitials(name) || '?'}</text>
      <ellipse cx="70" cy="106" rx="38" ry="16" fill="rgba(252,174,145,0.12)" stroke="rgba(252,174,145,0.25)" strokeWidth="1.2"/>
      <circle cx="110" cy="34" r="7" fill="rgba(252,174,145,0.2)" stroke="rgba(252,174,145,0.4)" strokeWidth="1"/>
      <circle cx="30" cy="94" r="5" fill="rgba(249,160,139,0.15)" stroke="rgba(249,160,139,0.3)" strokeWidth="1"/>
    </svg>
  );
}

function IllusStep2() {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r="68" fill="rgba(163,201,168,0.08)" stroke="rgba(163,201,168,0.2)" strokeWidth="1"/>
      <rect x="28" y="38" width="84" height="72" rx="10" fill="rgba(163,201,168,0.12)" stroke="rgba(163,201,168,0.35)" strokeWidth="1.5"/>
      <line x1="28" y1="56" x2="112" y2="56" stroke="rgba(163,201,168,0.4)" strokeWidth="1"/>
      <rect x="38" y="64" width="20" height="14" rx="3" fill="rgba(163,201,168,0.3)"/>
      <rect x="64" y="64" width="20" height="14" rx="3" fill="rgba(163,201,168,0.15)"/>
      <rect x="90" y="64" width="14" height="14" rx="3" fill="rgba(163,201,168,0.15)"/>
      <rect x="38" y="84" width="44" height="14" rx="3" fill="rgba(163,201,168,0.3)"/>
      <circle cx="48" cy="46" r="5" fill="rgba(163,201,168,0.25)" stroke="rgba(163,201,168,0.5)" strokeWidth="1"/>
      <circle cx="92" cy="46" r="5" fill="rgba(163,201,168,0.25)" stroke="rgba(163,201,168,0.5)" strokeWidth="1"/>
      <line x1="48" y1="28" x2="48" y2="44" stroke="rgba(163,201,168,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="92" y1="28" x2="92" y2="44" stroke="rgba(163,201,168,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IllusStep3({ label }: { label: string }) {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r="68" fill="rgba(74,128,196,0.07)" stroke="rgba(74,128,196,0.18)" strokeWidth="1"/>
      <rect x="30" y="50" width="80" height="48" rx="10" fill="rgba(74,128,196,0.1)" stroke="rgba(74,128,196,0.3)" strokeWidth="1.5"/>
      <rect x="30" y="50" width="80" height="22" rx="10" fill="rgba(74,128,196,0.18)" stroke="none"/>
      <rect x="30" y="60" width="80" height="10" rx="0" fill="rgba(74,128,196,0.18)" stroke="none"/>
      <line x1="30" y1="72" x2="110" y2="72" stroke="rgba(74,128,196,0.25)" strokeWidth="0.8"/>
      {[38, 56, 74].map((x, i) => (
        <rect key={i} x={x} y="78" width="16" height="14" rx="4" fill={i === 1 ? 'rgba(74,128,196,0.4)' : 'rgba(74,128,196,0.12)'} stroke="rgba(74,128,196,0.3)" strokeWidth="0.8"/>
      ))}
      <text x="46" y="89" textAnchor="middle" fill="rgba(74,128,196,0.9)" fontSize="7" fontWeight="800" fontFamily="Manrope">8</text>
      <text x="64" y="89" textAnchor="middle" fill="#4A80C4" fontSize="7" fontWeight="800" fontFamily="Manrope">10</text>
      <text x="82" y="89" textAnchor="middle" fill="rgba(74,128,196,0.9)" fontSize="7" fontWeight="800" fontFamily="Manrope">12</text>
      <text x="70" y="64" textAnchor="middle" fill="rgba(74,128,196,0.7)" fontSize="9" fontWeight="700" fontFamily="Manrope">{label}</text>
    </svg>
  );
}

function IllusStep4({ label }: { label: string }) {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r="68" fill="rgba(91,171,114,0.08)" stroke="rgba(91,171,114,0.2)" strokeWidth="1"/>
      <circle cx="70" cy="62" r="30" fill="rgba(91,171,114,0.14)" stroke="rgba(91,171,114,0.35)" strokeWidth="1.5"/>
      <polyline points="56,62 66,72 84,52" fill="none" stroke="#5BAB72" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="35" cy="35" r="8" fill="rgba(91,171,114,0.12)" stroke="rgba(91,171,114,0.25)" strokeWidth="1"/>
      <circle cx="105" cy="95" r="6" fill="rgba(91,171,114,0.12)" stroke="rgba(91,171,114,0.25)" strokeWidth="1"/>
      <text x="70" y="108" textAnchor="middle" fill="#5BAB72" fontSize="10" fontWeight="800" fontFamily="Manrope">{label}</text>
    </svg>
  );
}

export function WizardAside({ step, total, name }: { step: number; total: number; name: string }) {
  const { t } = useTranslation('clients');
  return (
    <div className="v-modal-left" style={{
      padding: '30px 24px',
      background: 'linear-gradient(160deg, var(--peach-glow) 0%, transparent 55%), var(--bg-card)',
      borderRight: '1px solid rgba(252,174,145,0.18)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div className="vml-logo" style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '-0.5px', color: 'var(--text)', marginBottom: '32px' }}>
        velora<span style={{ color: 'var(--peach)' }}>.</span>
      </div>
      <div className="vml-step" style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(249,160,139,0.8)', marginBottom: '8px' }}>
        {t('addModal.stepCounter', { current: step, total })}
      </div>
      <div className="vml-title" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px', lineHeight: 1.25, marginBottom: '8px' }}>
        {t(`addModal.steps.${step}.title`)}
      </div>
      <div className="vml-sub" style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6, marginBottom: '28px' }}>
        {t(`addModal.steps.${step}.sub`)}
      </div>
      <div className="vml-dots" style={{ display: 'flex', gap: '6px', marginBottom: '28px' }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            height: '4px', flex: i + 1 <= step ? '2' : '1',
            borderRadius: '10px', transition: 'flex 0.4s cubic-bezier(0.34,1.56,0.64,1), background 0.3s ease',
            background: i + 1 <= step ? 'linear-gradient(90deg,#FCAE91,#F9A08B)' : 'rgba(var(--ink),0.1)',
          }}/>
        ))}
      </div>
      <div className="vml-illus" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {step === 1 && <IllusStep1 name={name}/>}
        {step === 2 && <IllusStep2/>}
        {step === 3 && <IllusStep3 label={t('panel.abonement.title')}/>}
        {step === 4 && <IllusStep4 label={t('addModal.steps.4.title')}/>}
      </div>
      <div className="vml-aside" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(249,160,139,0.06)', borderRadius: '10px', border: '1px solid rgba(249,160,139,0.15)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--peach)" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>{t('addModal.trustSignal')}</div>
      </div>
    </div>
  );
}
