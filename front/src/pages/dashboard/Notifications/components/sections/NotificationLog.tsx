import { useTranslation } from 'react-i18next';
import { EmptyState, Select } from '../../../../../components/ui/index';
import { CHANNELS } from '../../constants';
import styles from '../../Notifications.module.css';
import type { useNotificationLog } from '../../hooks/useNotificationLog';
import type { NotificationLogRow, NotificationLogStatus } from '../../../../../api/notifications/notifications.types';

// Цвет статуса несёт смысл, а не украшает: розовый — «точно не ушло и денег не
// списано», янтарный — «ответа от провайдера не было, списание НЕИЗВЕСТНО».
// Именно это различие поддержка и ищет, открывая журнал во время спора.
const STATUS_COLOR: Record<NotificationLogStatus, string> = {
  sent: '#A3C9A8',
  rejected: '#D88C9A',
  error: '#f0c040',
  pending: '#9AA0A6',
};

const STATUS_ORDER: NotificationLogStatus[] = ['sent', 'rejected', 'error', 'pending'];

const CHANNEL_BY_KEY = Object.fromEntries(CHANNELS.map(c => [c.key, c]));

export default function NotificationLog({ log }: { log: ReturnType<typeof useNotificationLog> }) {
  const { t, i18n } = useTranslation('notifications');
  const rows = log.data?.items ?? [];
  const summary = log.data?.summary;
  const filtered = !!(log.filters.status || log.filters.channel || log.filters.search.trim());

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(var(--ink),0.08)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid rgba(var(--ink),0.06)' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--onyx)' }}>{t('log.title')}</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{t('log.subtitle')}</div>
      </div>

      {/* Счётчики. Кликом фильтруют — «отклонено 3» без ответа «какие именно»
          было бы ровно тем же молчанием, от которого журнал и заводился. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '12px', padding: '20px 24px', background: 'var(--bg2)',
        borderBottom: '1px solid rgba(var(--ink),0.06)',
      }}>
        {STATUS_ORDER.map(status => {
          const active = log.filters.status === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => log.setStatus(active ? undefined : status)}
              aria-pressed={active}
              style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
                background: 'var(--bg-card)', fontFamily: "'Manrope', sans-serif",
                border: `1px solid ${active ? STATUS_COLOR[status] : 'rgba(var(--ink),0.08)'}`,
                boxShadow: active ? `0 0 0 3px ${STATUS_COLOR[status]}22` : 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLOR[status], flexShrink: 0 }} />
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  {t(`log.status.${status}`)}
                </span>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--onyx)', marginTop: '4px' }}>
                {summary ? summary[status] : '—'}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '12px', padding: '16px 24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={log.filters.search}
          onChange={e => log.setSearch(e.target.value)}
          placeholder={t('log.searchPlaceholder')}
          style={{
            flex: '1 1 240px', minWidth: 0, padding: '10px 14px', borderRadius: '8px',
            border: '1px solid rgba(var(--ink),0.1)', background: 'var(--bg-card)',
            color: 'var(--onyx)', fontSize: '13px', fontFamily: "'Manrope', sans-serif", outline: 'none',
          }}
        />
        <div style={{ width: '180px' }}>
          <Select
            value={log.filters.channel ?? ''}
            onChange={v => log.setChannel(v || undefined)}
            placeholder={t('log.allChannels')}
            options={[
              { value: '', label: t('log.allChannels') },
              ...CHANNELS.map(c => ({ value: c.key, label: c.label })),
            ]}
          />
        </div>
        {filtered && (
          <button
            type="button"
            onClick={() => { log.setStatus(undefined); log.setChannel(undefined); log.setSearch(''); }}
            style={{
              padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 800,
              background: 'none', border: '1px solid rgba(var(--ink),0.1)', color: 'var(--muted)',
              fontFamily: "'Manrope', sans-serif",
            }}
          >
            {t('log.reset')}
          </button>
        )}
        {log.refreshing && (
          <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>{t('log.refreshing')}</span>
        )}
      </div>

      {log.loadError ? (
        <div style={{ padding: '40px 24px' }}>
          <EmptyState size="sm" icon="search" title={t('log.loadError')} text={t('log.loadErrorHint')} />
        </div>
      ) : log.loading ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
          {t('loading')}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '40px 24px' }}>
          <EmptyState
            size="sm"
            icon="search"
            title={filtered ? t('log.emptyFiltered') : t('log.empty')}
            text={filtered ? t('log.emptyFilteredHint') : t('log.emptyHint')}
          />
        </div>
      ) : (
        <div>
          {rows.map((row, i) => (
            <LogRow key={row.id} row={row} striped={i % 2 === 1} lang={i18n.language} />
          ))}
        </div>
      )}

      {log.data && log.data.total > log.pageSize && (
        <div style={{
          padding: '16px 24px', borderTop: '1px solid rgba(var(--ink),0.08)', background: 'var(--bg2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
            {t('log.range', {
              from: log.offset + 1,
              to: Math.min(log.offset + log.pageSize, log.data.total),
              total: log.data.total,
            })}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <PagerButton disabled={!log.canPrev} onClick={log.prev} label={t('log.prev')} />
            <PagerButton disabled={!log.canNext} onClick={log.next} label={t('log.next')} />
          </div>
        </div>
      )}
    </div>
  );
}

function LogRow({ row, striped, lang }: { row: NotificationLogRow; striped: boolean; lang: string }) {
  const { t } = useTranslation('notifications');
  const channel = CHANNEL_BY_KEY[row.channel];
  const color = STATUS_COLOR[row.status] ?? STATUS_COLOR.pending;
  // Событие есть не у всех строк: сценарии лояльности зовут deliver() мимо
  // каталога, и подписывать их несуществующим ключом i18n нельзя.
  const known = row.event_id && t(`events.${row.event_id}.title`) !== `events.${row.event_id}.title`;

  return (
    <div
      className={styles.logRow}
      style={{
        display: 'grid', gridTemplateColumns: '150px 1fr 150px 110px', gap: '12px',
        padding: '14px 24px', alignItems: 'center',
        background: striped ? 'rgba(var(--ink),0.01)' : 'transparent',
        borderBottom: '1px solid rgba(var(--ink),0.04)',
      }}
    >
      <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
        {new Date(row.created_at).toLocaleString(lang, {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>
          {known ? t(`events.${row.event_id}.title`) : t('log.otherEvent')}
        </div>
        {/* Ответ провайдера — то самое, чем спор закрывается по существу:
            «шаблон не одобрен», «вне 24-часового окна», «нет оплаты». */}
        {row.error && (
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', wordBreak: 'break-word' }}>
            {row.error}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        {channel && (
          <span style={{ color: channel.color, display: 'flex', flexShrink: 0 }}>
            <channel.IconComp />
          </span>
        )}
        <span style={{ fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.recipient_address ?? '—'}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px',
          borderRadius: '999px', background: `${color}1A`, color,
          fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap',
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
          {t(`log.status.${row.status}`)}
        </span>
      </div>
    </div>
  );
}

function PagerButton({ disabled, onClick, label }: { disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 800,
        fontFamily: "'Manrope', sans-serif", background: 'var(--bg-card)',
        border: '1px solid rgba(var(--ink),0.1)', color: 'var(--onyx)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}
