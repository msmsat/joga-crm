import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ModalShell, useModalClose } from '../../../../../components/ui/index';
import type { ChannelBrand } from './channelBrand';

// Общий каркас четырёх канальных модалок (Telegram / WhatsApp / Instagram / Email):
// слева — ониксовый герой канала (логотип, статус, реквизит), справа — заголовок,
// тело и футер. Герой намеренно в палитре Velora (оникс + персик), а не в цветах
// бренда канала: фирменный цвет живёт только в логотипе и еле заметном свечении,
// иначе модалка кричит и выпадает из интерфейса.

const EASE = [0.22, 1, 0.36, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.42, delay, ease: EASE },
});

interface ChannelModalShellProps {
  brand: ChannelBrand;
  name: string;                 // «Telegram»
  tagline: string;              // подзаголовок канала
  connected: boolean;
  detail?: string;              // @bot, +7…, e-mail — реквизит подключения
  title: string;                // заголовок правой колонки
  children: ReactNode;          // тело правой колонки
  footer: ReactNode;
  onClose: () => void;
}

export function ChannelModalShell({
  brand, name, tagline, connected, detail, title, children, footer, onClose,
}: ChannelModalShellProps) {
  const { t } = useTranslation('notifications');

  const hero = (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', color: '#FFFFFF' }}>
      {/* Персиковое свечение сверху + едва различимый оттенок канала снизу */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(100% 52% at 18% 0%, rgba(249,160,139,0.16), transparent 62%), radial-gradient(85% 45% at 100% 100%, ${brand.color}1F, transparent 66%)`,
      }} />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', padding: '30px 26px 26px' }}>
        <motion.div {...rise(0.04)} style={{
          fontSize: '10px', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.4)',
        }}>
          {t('chModal.eyebrow')}
        </motion.div>

        <motion.div {...rise(0.09)} style={{
          width: '56px', height: '56px', borderRadius: '18px', margin: '24px 0 18px',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          color: brand.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 10px 30px ${brand.color}26`,
        }}>
          {brand.icon}
        </motion.div>

        <motion.div {...rise(0.14)}>
          <div style={{ fontSize: '25px', fontWeight: 900, letterSpacing: '-0.7px', lineHeight: 1.1 }}>{name}</div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>
            {tagline}
          </div>
        </motion.div>

        <div style={{ flex: 1, minHeight: '28px' }} />

        <motion.div {...rise(0.2)} style={{
          borderRadius: '14px', padding: '13px 14px',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
              background: connected ? '#A3C9A8' : 'rgba(255,255,255,0.32)',
              boxShadow: connected ? '0 0 0 4px rgba(163,201,168,0.18)' : 'none',
            }} />
            <span style={{
              fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.02em',
              color: connected ? '#A3C9A8' : 'rgba(255,255,255,0.45)',
            }}>
              {connected ? t('chModal.connected') : t('chModal.notConnected')}
            </span>
          </div>
          {connected && detail && (
            <div style={{
              fontSize: '13px', fontWeight: 700, marginTop: '7px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {detail}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );

  return (
    <ModalShell
      size="lg"
      maxWidth="760px"
      onClose={onClose}
      left={hero}
      leftStyle={{ padding: 0, background: 'linear-gradient(165deg, #262626 0%, #141414 100%)' }}
    >
      <ChannelHeader title={title} />
      <div className="ms-scroll" style={{
        padding: '22px 26px', overflowY: 'auto', flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        {children}
      </div>
      <div style={{
        display: 'flex', gap: '10px', padding: '16px 26px',
        borderTop: '1px solid var(--border, rgba(var(--ink),0.08))', flexShrink: 0,
      }}>
        {footer}
      </div>
    </ModalShell>
  );
}

// Шапка правой колонки: только название шага + крестик — имя канала уже
// крупно стоит в герое, дублировать его сверху незачем.
function ChannelHeader({ title }: { title: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '22px 26px 14px', flexShrink: 0,
    }}>
      <h2 style={{ fontSize: '17px', fontWeight: 900, letterSpacing: '-0.4px', color: 'var(--text, #1A1A1A)', margin: 0 }}>
        {title}
      </h2>
      <CloseButton />
    </div>
  );
}

function CloseButton() {
  const close = useModalClose();
  return (
    <button
      type="button"
      onClick={close}
      aria-label="close"
      style={{
        width: '30px', height: '30px', borderRadius: '10px', flexShrink: 0,
        background: 'rgba(var(--ink),0.05)', border: 'none', cursor: 'pointer', color: 'var(--text3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--ink),0.1)'; e.currentTarget.style.color = 'var(--onyx)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--ink),0.05)'; e.currentTarget.style.color = 'var(--text3)'; }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

// ── Блоки тела ──────────────────────────────────────────────────────────────

// Инструкция как вертикальный таймлайн с нумерованными точками вместо серого <ol>.
export function Steps({ title, items }: { title: string; items: ReactNode[] }) {
  return (
    <div>
      <div style={{
        fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#AAAAAA', marginBottom: '14px',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((item, i) => (
          <motion.div
            key={i}
            {...rise(0.06 + i * 0.05)}
            style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: '12px', position: 'relative' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                background: 'rgba(249,160,139,0.14)', border: '1.5px solid rgba(249,160,139,0.45)',
                color: '#E8836A', fontSize: '11px', fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {i + 1}
              </div>
              {i < items.length - 1 && (
                <div style={{ flex: 1, width: '1.5px', background: 'rgba(249,160,139,0.28)', margin: '4px 0' }} />
              )}
            </div>
            <div style={{
              fontSize: '12.5px', lineHeight: 1.6, color: 'var(--text2, #666666)',
              paddingBottom: i < items.length - 1 ? '14px' : 0,
            }}>
              {item}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const NOTICE_TONE = {
  warn: { bg: 'rgba(232,166,58,0.09)', border: 'rgba(232,166,58,0.28)', fg: '#9A7420' },
  info: { bg: 'rgba(var(--ink),0.03)', border: 'rgba(var(--ink),0.07)', fg: 'var(--text2, #666666)' },
  ok:   { bg: 'rgba(91,171,114,0.09)', border: 'rgba(91,171,114,0.26)', fg: '#3E8F5C' },
} as const;

export function Notice({ tone = 'info', children }: { tone?: keyof typeof NOTICE_TONE; children: ReactNode }) {
  const c = NOTICE_TONE[tone];
  return (
    <div style={{
      display: 'flex', gap: '10px', padding: '13px 15px', borderRadius: '14px',
      background: c.bg, border: `1px solid ${c.border}`,
      fontSize: '12px', lineHeight: 1.6, color: c.fg,
    }}>
      <span style={{ flexShrink: 0, marginTop: '1px', color: c.fg, opacity: 0.85 }}>
        {tone === 'ok' ? <IconCheck /> : tone === 'warn' ? <IconWarn /> : <IconInfo />}
      </span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

// Строка «поле — значение» для состояния «уже подключено».
export function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
      padding: '13px 15px', borderRadius: '14px', background: 'rgba(var(--ink),0.025)',
      border: '1px solid rgba(var(--ink),0.05)',
    }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: '#AAAAAA', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: '13px', fontWeight: 700, color: 'var(--text, #1A1A1A)',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
    </div>
  );
}

// Кнопка «Отключить» в футере — деструктивная, поэтому не персиковый CTA.
export function DangerButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: '12px 20px', borderRadius: '12px',
        background: 'rgba(216,140,154,0.1)', border: '1.5px solid rgba(216,140,154,0.35)',
        color: '#C4677A', fontSize: '13.5px', fontWeight: 800,
        fontFamily: 'Manrope, sans-serif', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'all 0.18s',
      }}
    >
      {children}
    </button>
  );
}

// ── Иконки ──────────────────────────────────────────────────────────────────

function IconInfo() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
    </svg>
  );
}

function IconWarn() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

