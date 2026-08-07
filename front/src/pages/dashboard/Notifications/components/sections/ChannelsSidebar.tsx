import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelKey } from '../../types';
import { CHANNELS } from '../../constants';
import { waEnableBlocker } from '../../utils';
import { Tooltip } from '../../../../../components/ui/index';
import NotifIllustration from '../ui/NotifIllustration';
import ToggleSwitch from '../ui/ToggleSwitch';
import type { NotifyChannelsStatus } from '../../../../../api/notifications/notifications.types';

// Каналы, для которых есть реальное подключение (модалка).
// SMS/Push подключаются в других разделах — клик по ним не открывает модалку.
const MODAL_KEY: Partial<Record<ChannelKey, 'tg' | 'email' | 'wa'>> = {
  telegram: 'tg', email: 'email', whatsapp: 'wa',
};

function isIntegrationConnected(statuses: NotifyChannelsStatus | undefined, key: ChannelKey): boolean | null {
  if (!statuses) return null;
  if (key === 'telegram') return statuses.telegram.connected;
  if (key === 'email') return statuses.email.connected;
  if (key === 'whatsapp') return statuses.whatsapp.connected;
  return null;
}

function integrationSub(statuses: NotifyChannelsStatus | undefined, key: ChannelKey, fallback: string): string {
  const details = key === 'telegram' ? statuses?.telegram.details
    : key === 'email' ? statuses?.email.details
    : key === 'whatsapp' ? statuses?.whatsapp.details
    : undefined;
  if (!details) return fallback;
  const value = key === 'telegram' ? (details.bot_username && `@${details.bot_username}`)
    : key === 'email' ? details.email
    : key === 'whatsapp' ? details.display_phone_number
    : undefined;
  return (value as string | undefined) || '—';
}

interface Props {
  channels: Record<ChannelKey, boolean>;
  toggleChannel: (key: ChannelKey) => void;
  channelSaving?: boolean;
  channelStatuses?: NotifyChannelsStatus;
  onOpenModal: (modal: 'tg' | 'email' | 'wa') => void;
}

export default function ChannelsSidebar({ channels, toggleChannel, channelSaving, channelStatuses, onOpenModal }: Props) {
  const { t } = useTranslation('notifications');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <NotifIllustration />

      <div className="card" style={{ padding: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '16px' }}>
          {t('channels.title')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {CHANNELS.map(ch => {
            const modalKey = MODAL_KEY[ch.key];
            const requiresIntegration = modalKey !== undefined;
            const integrationConnected = isIntegrationConnected(channelStatuses, ch.key);
            const needsConnect = requiresIntegration && integrationConnected === false;
            const sub = requiresIntegration ? integrationSub(channelStatuses, ch.key, ch.sub) : ch.sub;
            // Номер подключён, но Meta ещё не сняла один из трёх барьеров (карта,
            // верификация бизнеса, одобренные шаблоны) — доставка ровно ноль.
            // Тумблер в этом состоянии не даём включить вовсе: включённый, он
            // обещал бы рассылку, о поломке которой владелец узнал бы только по
            // тому, что клиентам ничего не приходит. Показываем ПЕРВЫЙ барьер —
            // три жёлтых блока подряд читались бы как шум, а закрывают их
            // по очереди.
            const waBlocker = ch.key === 'whatsapp' ? waEnableBlocker(channelStatuses?.whatsapp) : null;
            // Выключить уже включённый канал можно всегда: запрет на ВКЛЮЧЕНИЕ
            // не должен превращаться в ловушку (бэкенд гейтит ровно так же).
            const toggleLocked = waBlocker !== null && !channels[ch.key];

            const handleClick = () => {
              if (modalKey) onOpenModal(modalKey);
            };

            return (
              <Fragment key={ch.key}>
              <div
                role={requiresIntegration ? 'button' : undefined}
                tabIndex={requiresIntegration ? 0 : undefined}
                aria-label={requiresIntegration ? t('channels.openSettings', { channel: ch.label }) : undefined}
                onClick={requiresIntegration ? handleClick : undefined}
                onKeyDown={requiresIntegration ? (e => {
                  // target !== currentTarget: клавиша нажата на вложенной кнопке
                  // (тумблер/«Подключить») — та обрабатывает Enter/Space сама.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); }
                }) : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                  borderRadius: '12px', background: channels[ch.key] ? `${ch.color}0D` : 'transparent',
                  transition: 'background 0.2s', cursor: requiresIntegration ? 'pointer' : 'default',
                }}
              >
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: channels[ch.key] ? `${ch.color}18` : 'rgba(var(--ink),0.04)',
                  color: channels[ch.key] ? ch.color : 'var(--text3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s', flexShrink: 0,
                }}>
                  <ch.IconComp />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: channels[ch.key] ? 'var(--onyx)' : 'var(--text3)' }}>
                    {ch.label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sub}
                  </div>
                </div>
                {needsConnect ? (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onOpenModal(modalKey); }}
                    style={{
                      padding: '5px 10px', borderRadius: '8px', border: 'none',
                      background: 'rgba(var(--ink),0.06)', color: 'var(--muted)',
                      fontSize: '11px', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {t('channels.connect')}
                  </button>
                ) : toggleLocked ? (
                  // Тултип на обёртке, а не на кнопке: disabled-кнопка не шлёт
                  // события мыши, поэтому тумблер здесь ещё и прозрачен для
                  // указателя (pointerThrough) — иначе подсказка не появилась бы
                  // именно там, где нужнее всего, а клик по нему не открывал бы
                  // модалку канала с инструкцией.
                  <Tooltip label={t('channels.waLockedHint')}>
                    <ToggleSwitch
                      on={false}
                      onChange={() => {}}
                      disabled
                      pointerThrough
                      aria-label={ch.label}
                    />
                  </Tooltip>
                ) : (
                  <ToggleSwitch
                    on={channels[ch.key]}
                    onChange={() => toggleChannel(ch.key)}
                    disabled={channelSaving}
                    aria-label={ch.label}
                  />
                )}
              </div>

              {/* Текстом, а не только тултипом: с клавиатуры до заблокированного
                  тумблера не добраться, а причина нужна всем. Строка кликабельна
                  и ведёт в модалку канала — там расписано, что делать. */}
              {waBlocker && (
                <button
                  type="button"
                  onClick={() => onOpenModal('wa')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                    margin: '-2px 0 2px', padding: '8px 12px', borderRadius: '10px',
                    background: 'rgba(232,166,58,0.09)', border: '1px solid rgba(232,166,58,0.28)',
                    color: '#9A7420', fontSize: '11px', fontWeight: 700, lineHeight: 1.4,
                    fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><circle cx="12" cy="17" r="0.6" fill="currentColor" />
                  </svg>
                  <span style={{ minWidth: 0 }}>
                    {t(`channels.waBlocker.${waBlocker}`)}
                  </span>
                </button>
              )}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(249,160,139,0.08)', border: '1px solid rgba(249,160,139,0.2)', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6 }}>
        <span style={{ color: '#F9A08B', fontWeight: 800 }}>{t('matrix.adviceLabel')}</span> {t('matrix.advice')}
      </div>
    </div>
  );
}
