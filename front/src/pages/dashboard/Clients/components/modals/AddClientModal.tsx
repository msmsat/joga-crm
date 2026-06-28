import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useClientForm } from '../../hooks/useClientForm';
import type { ClientFormState } from '../../hooks/useClientForm';
import { clientsApi } from '../../../../../api/clients';

export interface AddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (form: ClientFormState) => void;
}

// ─── STEP ILLUSTRATIONS ───────────────────────────────────────────────────────
function IllusStep1({ name }: { name: string }) {
  const initials = name.trim()
    ? name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r="68" fill="rgba(252,174,145,0.08)" stroke="rgba(252,174,145,0.2)" strokeWidth="1"/>
      <circle cx="70" cy="54" r="26" fill="rgba(252,174,145,0.18)" stroke="rgba(252,174,145,0.4)" strokeWidth="1.5"/>
      <text x="70" y="62" textAnchor="middle" fill="#FCAE91" fontSize="18" fontWeight="800" fontFamily="Manrope">{initials}</text>
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

function IllusStep3() {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r="68" fill="rgba(74,128,196,0.07)" stroke="rgba(74,128,196,0.18)" strokeWidth="1"/>
      <rect x="30" y="50" width="80" height="48" rx="10" fill="rgba(74,128,196,0.1)" stroke="rgba(74,128,196,0.3)" strokeWidth="1.5"/>
      <rect x="30" y="50" width="80" height="22" rx="10" fill="rgba(74,128,196,0.18)" stroke="none"/>
      <rect x="30" y="60" width="80" height="10" rx="0" fill="rgba(74,128,196,0.18)" stroke="none"/>
      <line x1="30" y1="72" x2="110" y2="72" stroke="rgba(74,128,196,0.25)" strokeWidth="0.8"/>
      {[38,56,74].map((x, i) => (
        <g key={i}>
          <rect x={x} y="78" width="16" height="14" rx="4" fill={i === 1 ? "rgba(74,128,196,0.4)" : "rgba(74,128,196,0.12)"} stroke="rgba(74,128,196,0.3)" strokeWidth="0.8"/>
        </g>
      ))}
      <text x="46" y="89" textAnchor="middle" fill="rgba(74,128,196,0.9)" fontSize="7" fontWeight="800" fontFamily="Manrope">8</text>
      <text x="64" y="89" textAnchor="middle" fill="#4A80C4" fontSize="7" fontWeight="800" fontFamily="Manrope">10</text>
      <text x="82" y="89" textAnchor="middle" fill="rgba(74,128,196,0.9)" fontSize="7" fontWeight="800" fontFamily="Manrope">12</text>
      <text x="70" y="64" textAnchor="middle" fill="rgba(74,128,196,0.7)" fontSize="9" fontWeight="700" fontFamily="Manrope">Абонемент</text>
    </svg>
  );
}

function IllusStep4() {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r="68" fill="rgba(91,171,114,0.08)" stroke="rgba(91,171,114,0.2)" strokeWidth="1"/>
      <circle cx="70" cy="62" r="30" fill="rgba(91,171,114,0.14)" stroke="rgba(91,171,114,0.35)" strokeWidth="1.5"/>
      <polyline points="56,62 66,72 84,52" fill="none" stroke="#5BAB72" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="35" cy="35" r="8" fill="rgba(91,171,114,0.12)" stroke="rgba(91,171,114,0.25)" strokeWidth="1"/>
      <circle cx="105" cy="95" r="6" fill="rgba(91,171,114,0.12)" stroke="rgba(91,171,114,0.25)" strokeWidth="1"/>
      <text x="70" y="108" textAnchor="middle" fill="#5BAB72" fontSize="10" fontWeight="800" fontFamily="Manrope">Готово!</text>
    </svg>
  );
}

// ─── FIELD ────────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, error, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; type?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', padding: '11px 14px', borderRadius: '10px',
          border: `1.5px solid ${error ? '#D88C9A' : focused ? 'var(--peach)' : 'var(--border)'}`,
          outline: 'none', fontSize: '13px', fontWeight: 500, color: 'var(--text)',
          background: focused ? 'rgba(249,160,139,0.02)' : 'rgba(26,26,26,0.015)',
          fontFamily: "'Manrope',sans-serif", transition: 'border-color 0.2s, box-shadow 0.2s',
          boxShadow: focused ? '0 0 0 3px rgba(249,160,139,0.12)' : 'none',
          boxSizing: 'border-box',
        }}
      />
      {error && <div style={{ fontSize: '11px', color: '#D88C9A', fontWeight: 600, marginTop: '4px' }}>{error}</div>}
    </div>
  );
}

// ─── TAG INPUT ────────────────────────────────────────────────────────────────
function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const t = draft.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
  };
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>Теги</div>
      <div style={{ minHeight: '44px', padding: '6px 10px', borderRadius: '10px', border: '1.5px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', cursor: 'text', boxSizing: 'border-box', transition: 'border-color 0.2s', background: 'rgba(26,26,26,0.015)' }}>
        {tags.map(t => (
          <span key={t} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '20px', background: 'rgba(249,160,139,0.12)', color: 'var(--peach)', border: '1px solid rgba(249,160,139,0.25)', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            {t}
            <button onClick={() => onChange(tags.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--peach)', fontSize: '12px', lineHeight: 1, display: 'flex' }}>×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={tags.length === 0 ? 'Пилатес, VIP, Реабилитация... (Enter)' : ''}
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '13px', fontFamily: "'Manrope',sans-serif", color: 'var(--text)', minWidth: '120px', flex: 1 }}
        />
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>Нажмите Enter чтобы добавить тег</div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export function AddClientModal({ isOpen, onClose, onSuccess }: AddClientModalProps) {
  const { form, errors, set, validate, reset } = useClientForm();
  const [step, setStep] = useState(1);
  const [dir,  setDir]  = useState(1);
  const [sendSms, setSendSms] = useState(true);

  if (!isOpen) return null;

  const TOTAL = 4;

  const stepMeta = [
    { title: 'Личные данные',   sub: 'Введите контактную информацию клиента' },
    { title: 'Детали профиля',  sub: 'Дополнительная информация (необязательно)' },
    { title: 'Абонемент',       sub: 'Выберите тип абонемента и добавьте заметку' },
    { title: 'Готово!',         sub: 'Проверьте данные и добавьте клиента' },
  ];

  const canGoNext = () => {
    if (step === 1) return form.name.trim().length >= 2;
    return true;
  };

  const goNext = () => {
    if (step === 1 && !validate()) return;
    if (step < TOTAL) { setDir(1); setStep(s => s + 1); }
  };

  const goBack = () => {
    if (step > 1) { setDir(-1); setStep(s => s - 1); }
  };

  const handleFinish = () => {
    const parts = form.name.trim().split(' ');
    clientsApi.create({
      name:      parts[0],
      last_name: parts.slice(1).join(' ') || null,
      phone:     form.phone || null,
      email:     form.email || null,
      city:      form.city  || null,
      tags:      form.tags.length ? form.tags : undefined,
      note:      form.note  || null,
    }).then(() => {
      onSuccess(form);
      reset();
      setStep(1);
      onClose();
    });
  };

  const handleClose = () => {
    reset();
    setStep(1);
    onClose();
  };

  const initials = form.name.trim()
    ? form.name.trim().split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '';

  return (
    <>
      <style>{`
        @keyframes acOverlayIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes acModalIn   { from { opacity: 0; transform: scale(0.94) translateY(20px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        @keyframes acStepIn    { from { opacity: 0; transform: translateX(calc(var(--ac-dir, 1) * 24px)) } to { opacity: 1; transform: translateX(0) } }
        @keyframes acCheckPop  { 0% { transform: scale(0) } 70% { transform: scale(1.2) } 100% { transform: scale(1) } }
        @keyframes acPulse     { 0%,100% { box-shadow: 0 0 0 0 rgba(91,171,114,0.4) } 50% { box-shadow: 0 0 0 10px rgba(91,171,114,0) } }
      `}</style>

      {/* Overlay */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(26,26,26,0.5)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'acOverlayIn 0.22s ease both',
        }}
      >
        {/* Modal */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '860px', height: '596px', maxWidth: 'calc(100vw - 32px)',
            background: '#fff', borderRadius: '24px', overflow: 'hidden',
            display: 'flex', boxShadow: '0 40px 100px -20px rgba(26,26,26,0.28)',
            animation: 'acModalIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
          }}
        >
          {/* ─ LEFT PANEL ─ */}
          <div style={{
            width: '260px', flexShrink: 0, padding: '36px 28px',
            background: 'linear-gradient(160deg, #fff9f6 0%, #fff4ef 60%, #fdeee8 100%)',
            borderRight: '1px solid rgba(252,174,145,0.18)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Logo */}
            <div style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '-0.5px', color: 'var(--text)', marginBottom: '32px' }}>
              velora<span style={{ color: 'var(--peach)' }}>.</span>
            </div>

            {/* Step label */}
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(249,160,139,0.8)', marginBottom: '8px' }}>
              Шаг {step} из {TOTAL}
            </div>

            {/* Title */}
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px', lineHeight: 1.25, marginBottom: '8px' }}>
              {stepMeta[step - 1].title}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6, marginBottom: '28px' }}>
              {stepMeta[step - 1].sub}
            </div>

            {/* Step dots */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '28px' }}>
              {Array.from({ length: TOTAL }).map((_, i) => (
                <div key={i} style={{
                  height: '4px', flex: i + 1 <= step ? '2' : '1',
                  borderRadius: '10px', transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                  background: i + 1 <= step
                    ? `linear-gradient(90deg,#FCAE91,#F9A08B)`
                    : 'rgba(26,26,26,0.1)',
                }}/>
              ))}
            </div>

            {/* Illustration */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {step === 1 && <IllusStep1 name={form.name}/>}
              {step === 2 && <IllusStep2/>}
              {step === 3 && <IllusStep3/>}
              {step === 4 && <IllusStep4/>}
            </div>

            {/* Trust signal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(249,160,139,0.06)', borderRadius: '10px', border: '1px solid rgba(249,160,139,0.15)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--peach)" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>
                Данные защищены и видны только администраторам
              </div>
            </div>
          </div>

          {/* ─ RIGHT PANEL ─ */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Header */}
            <div style={{ padding: '24px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Новый клиент</div>
              <button
                onClick={handleClose}
                style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(26,26,26,0.05)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text3)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Form body */}
            <div
              key={step}
              style={{
                flex: 1, overflowY: 'auto', padding: '28px 32px',
                animation: 'acStepIn 0.3s ease both',
                ['--ac-dir' as string]: dir,
              }}
            >
              {/* ── STEP 1 ── */}
              {step === 1 && (
                <div>
                  {initials && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', padding: '12px 16px', background: 'rgba(249,160,139,0.05)', borderRadius: '12px', border: '1px solid rgba(249,160,139,0.15)' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '11px', background: 'linear-gradient(135deg,#FCAE91,#F9A08B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{form.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Новый клиент · Предпросмотр</div>
                      </div>
                    </div>
                  )}
                  <Field label="ФИО *" value={form.name} onChange={v => set('name', v)} error={errors.name} placeholder="Иван Иванов"/>
                  <Field label="Телефон" value={form.phone} onChange={v => set('phone', v)} error={errors.phone} placeholder="+7 900 000-00-00" type="tel"/>
                  <Field label="Email" value={form.email} onChange={v => set('email', v)} error={errors.email} placeholder="client@example.com" type="email"/>
                </div>
              )}

              {/* ── STEP 2 ── */}
              {step === 2 && (
                <div>
                  <Field label="День рождения" value={form.bday} onChange={v => set('bday', v)} placeholder="12 апреля 1990"/>
                  <Field label="Город" value={form.city} onChange={v => set('city', v)} placeholder="Москва"/>
                  <TagInput tags={form.tags} onChange={tags => set('tags', tags)}/>
                </div>
              )}

              {/* ── STEP 3 ── */}
              {step === 3 && (
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px' }}>Количество занятий</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      {[8, 10, 12].map(n => (
                        <button
                          key={n}
                          onClick={() => set('abMax', n)}
                          style={{
                            padding: '18px 10px', borderRadius: '14px', textAlign: 'center', cursor: 'pointer',
                            fontFamily: "'Manrope',sans-serif", transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                            border: form.abMax === n ? '2px solid var(--peach)' : '2px solid var(--border)',
                            background: form.abMax === n ? 'rgba(249,160,139,0.06)' : 'transparent',
                            boxShadow: form.abMax === n ? '0 4px 16px -4px rgba(249,160,139,0.3)' : 'none',
                          }}
                        >
                          <div style={{ fontSize: '26px', fontWeight: 800, color: form.abMax === n ? 'var(--peach)' : 'var(--text)', letterSpacing: '-1px', lineHeight: 1 }}>{n}</div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', marginTop: '4px' }}>занятий</div>
                          {form.abMax === n && (
                            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--peach)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Выбрано</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>Заметка</div>
                    <textarea
                      value={form.note}
                      onChange={e => set('note', e.target.value)}
                      placeholder="Особые пожелания, противопоказания, предпочтения..."
                      rows={4}
                      style={{
                        width: '100%', padding: '11px 14px', borderRadius: '10px',
                        border: '1.5px solid var(--border)', outline: 'none',
                        fontSize: '13px', fontWeight: 500, color: 'var(--text)',
                        background: 'rgba(26,26,26,0.015)', fontFamily: "'Manrope',sans-serif",
                        resize: 'vertical', lineHeight: 1.6, transition: 'border-color 0.2s',
                        boxSizing: 'border-box',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'var(--peach)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(249,160,139,0.12)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                  </div>
                </div>
              )}

              {/* ── STEP 4 ── */}
              {step === 4 && (
                <div>
                  {/* Success icon */}
                  <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                    <div style={{
                      width: '64px', height: '64px', borderRadius: '18px', margin: '0 auto 16px',
                      background: 'linear-gradient(135deg,#5BAB72,#4a9660)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      animation: 'acCheckPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both, acPulse 2s ease 0.5s infinite',
                    }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.4px', marginBottom: '6px' }}>Данные заполнены!</div>
                    <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Проверьте информацию и подтвердите добавление</div>
                  </div>

                  {/* Summary card */}
                  <div style={{ padding: '20px', borderRadius: '14px', background: 'rgba(26,26,26,0.02)', border: '1px solid var(--border)', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg,#FCAE91,#F9A08B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                        {form.name.trim().split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
                      </div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>{form.name || '—'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Новый клиент</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {[
                        { l: 'Телефон',   v: form.phone || '—' },
                        { l: 'Email',     v: form.email || '—' },
                        { l: 'Д.р.',      v: form.bday  || '—' },
                        { l: 'Город',     v: form.city  || '—' },
                        { l: 'Абонемент', v: `${form.abMax} занятий` },
                        { l: 'Теги',      v: form.tags.length ? form.tags.join(', ') : '—' },
                      ].map(({ l, v }) => (
                        <div key={l} style={{ padding: '10px 12px', borderRadius: '8px', background: '#fff', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{l}</div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* SMS toggle */}
                  <div
                    onClick={() => setSendSms(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '10px', background: 'rgba(249,160,139,0.04)', border: '1px solid rgba(249,160,139,0.15)', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Отправить SMS-приветствие</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Клиент получит сообщение с приглашением</div>
                    </div>
                    <div style={{ width: '36px', height: '20px', borderRadius: '20px', background: sendSms ? 'linear-gradient(135deg,#FCAE91,#F9A08B)' : 'rgba(26,26,26,0.1)', transition: 'all 0.3s', position: 'relative', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: '2px', left: sendSms ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.15)', transition: 'left 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}/>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '20px 32px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(26,26,26,0.01)' }}>
              <button
                onClick={step === 1 ? handleClose : goBack}
                style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', fontSize: '13px', fontWeight: 700, color: 'var(--text3)', cursor: 'pointer', fontFamily: "'Manrope',sans-serif", transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text2)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)'; }}
              >
                {step === 1 ? 'Отмена' : '← Назад'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{step} / {TOTAL}</div>
                {step < TOTAL ? (
                  <button
                    onClick={goNext}
                    disabled={!canGoNext()}
                    style={{
                      padding: '10px 28px', borderRadius: '10px', border: 'none',
                      background: canGoNext() ? 'linear-gradient(135deg,#FCAE91,#F9A08B)' : 'rgba(26,26,26,0.06)',
                      color: canGoNext() ? '#fff' : 'var(--text3)',
                      fontSize: '13px', fontWeight: 700, cursor: canGoNext() ? 'pointer' : 'not-allowed',
                      fontFamily: "'Manrope',sans-serif",
                      boxShadow: canGoNext() ? '0 4px 14px -2px rgba(249,160,139,0.4)' : 'none',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { if (canGoNext()) { e.currentTarget.style.filter = 'brightness(1.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
                  >
                    Продолжить →
                  </button>
                ) : (
                  <button
                    onClick={handleFinish}
                    style={{
                      padding: '10px 28px', borderRadius: '10px', border: 'none',
                      background: 'linear-gradient(135deg,#5BAB72,#4a9660)',
                      color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                      fontFamily: "'Manrope',sans-serif",
                      boxShadow: '0 4px 14px -2px rgba(91,171,114,0.4)',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
                  >
                    Добавить клиента ✓
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
