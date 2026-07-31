import { useTranslation } from 'react-i18next';
import type { Employee } from '../types';
import { resolveImageUrl } from '../../../../api/client';

export interface EmployeeCardProps {
  employee: Employee & {
    _resolvedGroupKey: string;
    _translatedGroup: string;
    _translatedRole: string; // Наша новая переведенная роль!
  };
  isActive: boolean;
  onSelect: () => void;
  /** Отправить приглашение повторно — доступно только на ожидающей карточке. */
  onResendInvite: () => void;
  /** Отменить присоединение — убирает сотрудника из студии. */
  onCancelInvite: () => void;
  isResending: boolean;
}

export function EmployeeCard({
  employee: s, isActive, onSelect, onResendInvite, onCancelInvite, isResending,
}: EmployeeCardProps) {
  const { t } = useTranslation('staff');

  const initials = [s.name, s.last_name]
    .filter(Boolean)
    .map(n => n![0])
    .join('')
    .toUpperCase();

  const gradient = s.avatar_gradient ?? 'linear-gradient(135deg, #FCAE91, #F9A08B)';
  const photoUrl = resolveImageUrl(s.photo_url);

  // Приглашение ещё не принято: пароля у человека нет, войти он не может, и
  // показывать его профиль не на чем — статистика, график и залы пустые.
  // Поэтому карточка не открывается, а вместо неё даём два действия:
  // отправить письмо ещё раз или отменить присоединение.
  const isPending = !s.is_active;

  return (
    <div
      className={`s-item ${isActive ? 'active' : ''}`}
      onClick={isPending ? undefined : onSelect}
      title={isPending ? t('list.pendingHint') : undefined}
      style={isPending ? { cursor: 'default', opacity: 0.72 } : undefined}
    >
      <div
        className={`ava ${s.is_online && !isPending ? 'ava-online' : ''}`}
        style={{
          background: photoUrl ? `url(${photoUrl}) center/cover no-repeat` : gradient,
          width: '40px', height: '40px', fontSize: '13px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          filter: isPending ? 'grayscale(1)' : undefined,
        }}
      >
        {!photoUrl && initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="s-name" style={{ fontSize: '13px', fontWeight: 700, color: isPending ? 'var(--text3)' : undefined }}>
          {s.name}{s.last_name ? ' ' + s.last_name[0] + '.' : ''}
        </div>
        {/* 🔥 ПРОСТО ВЫВОДИМ ГОТОВУЮ СТРОКУ ИЗ VIEWMODEL */}
        <div className="s-role" style={{ fontSize: '11px', marginTop: '1px' }}>
          {isPending ? t('list.pendingLabel') : s._translatedRole}
        </div>
      </div>

      {isPending ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          <button
            type="button"
            title={t('list.resendInvite')}
            disabled={isResending}
            onClick={e => { e.stopPropagation(); onResendInvite(); }}
            style={{
              display: 'flex', padding: '5px', background: 'transparent', border: 'none',
              borderRadius: '7px', color: '#F9A08B', cursor: isResending ? 'default' : 'pointer',
              opacity: isResending ? 0.45 : 1,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
            </svg>
          </button>
          <button
            type="button"
            title={t('list.cancelInvite')}
            onClick={e => { e.stopPropagation(); onCancelInvite(); }}
            style={{
              display: 'flex', padding: '5px', background: 'transparent', border: 'none',
              borderRadius: '7px', color: 'var(--text3)', cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ) : (
        s.is_online && (
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#A3C9A8', flexShrink: 0 }} />
        )
      )}
    </div>
  );
}
