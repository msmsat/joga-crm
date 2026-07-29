import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../../../../api';
import { queryKeys } from '../../../../../api/queryKeys';
import { useCurrentSession } from '../../hooks/useCurrentSession';
import { fmtLastActive } from '../../../../../lib/format';
import styles from '../../Profile.module.css';

const CARD_STYLE: CSSProperties = {
  padding: '32px', borderRadius: '24px',
  background: 'linear-gradient(135deg, #111111 0%, #1e1e24 100%)',
  color: 'white', position: 'relative', overflow: 'hidden',
  boxShadow: '0 24px 48px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05)',
};

export default function ActiveSessionCard() {
  const { t } = useTranslation(["profile", "staff"]);
  // Тот же кэш, что заполняет личные данные (Задача 2) — второго запроса не требуется.
  const { data: me, isLoading } = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authApi.getMe(),
    staleTime: 60_000,
  });
  // Ключ общий со списком сессий Настроек — тоже без лишнего запроса.
  const current = useCurrentSession();

  if (isLoading) {
    return (
      <div style={CARD_STYLE}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', position: 'relative', zIndex: 1 }}>
          <div className={styles.skelDark} style={{ width: '72px', height: '72px', borderRadius: '20px', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className={styles.skelDark} style={{ width: '110px', height: '18px', borderRadius: '100px', marginBottom: '10px' }} />
            <div className={styles.skelDark} style={{ width: '160px', height: '22px', marginBottom: '8px' }} />
            <div className={styles.skelDark} style={{ width: '200px', height: '13px' }} />
          </div>
        </div>
      </div>
    );
  }

  if (!me) return null;

  const fullName = [me.name, me.last_name].filter(Boolean).join(' ');
  // Токен мог быть выдан в обход логина (верификация email, онбординг,
  // select-studio) — тогда своей строки в списке сессий нет, это не ошибка.
  const deviceLine = current ? [current.browser, current.platform, current.location_city].filter(Boolean).join(' · ') : '';

  return (
    <div style={CARD_STYLE}>
      <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', background: 'radial-gradient(circle, rgba(252,174,145,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', position: 'relative', zIndex: 1 }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '20px',
          background: 'linear-gradient(135deg, #FCAE91, #F9A08B)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '24px', fontWeight: 800, color: 'white',
          boxShadow: '0 12px 24px rgba(252,174,145,0.25)', flexShrink: 0,
        }}>
          {fullName.split(' ').map(n => n[0]).join('')}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'inline-block', padding: '4px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '100px', fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.9)', marginBottom: '10px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            {t("profile:session.current")}
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '4px', letterSpacing: '-0.5px' }}>{fullName}</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {me.email}
            {me.role && (
              <>
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                {t(`staff:roles.${me.role}`, { defaultValue: me.role })}
              </>
            )}
          </div>
        </div>
      </div>

      {current && (
        <div style={{ position: 'relative', zIndex: 1, marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '12px', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {deviceLine && <span>{deviceLine}</span>}
          {deviceLine && <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)' }} />}
          <span>{t('profile:session.lastActive', { time: fmtLastActive(current.last_active) })}</span>
        </div>
      )}
    </div>
  );
}
