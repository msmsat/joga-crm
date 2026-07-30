import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resolveImageUrl } from '../../api/client';
import { useMe } from '../../hooks/useMe';
import { getInitials } from '../../pages/dashboard/Clients/utils/mapClient';
import { useAccounts } from '../../pages/dashboard/Profile/hooks/useAccounts';
import { useLogout } from '../../pages/dashboard/Profile/hooks/useLogout';

// Инициалы студии для строки без лого — как в LinkedAccounts на /dashboard/profile
function studioInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

// Панель вынесена в отдельный компонент: запрос списка студий стартует только
// при первом открытии меню, а не на каждой загрузке каркаса.
function UserMenuPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['menu', 'staff']);
  const { data: me } = useMe();
  const { studios, switchingId, handleSwitchAccount } = useAccounts();
  const { handleLogout, isLoggingOut } = useLogout();

  const fullName = `${me?.name ?? ''} ${me?.last_name ?? ''}`.trim();

  return (
    <div className="user-menu-panel" role="menu">
      <div className="user-menu-head">
        <div className="user-avatar">{getInitials(me?.name ?? '', me?.last_name)}</div>
        <div style={{ minWidth: 0 }}>
          <div className="user-menu-name">{fullName || me?.email || ''}</div>
          <div className="user-menu-mail">{me?.email ?? ''}</div>
        </div>
      </div>

      {studios.length > 0 && (
        <>
          <div className="user-menu-sep" />
          <div className="user-menu-label">{t('menu:userMenu.accounts')}</div>
          <div className="user-menu-list">
            {studios.map(studio => {
              const logoSrc = resolveImageUrl(studio.logo_url);
              return (
                <button
                  key={studio.id}
                  type="button"
                  role="menuitem"
                  className="user-menu-item"
                  disabled={studio.is_current || switchingId !== null}
                  onClick={() => handleSwitchAccount(studio.id)}
                >
                  <span className="user-menu-logo">
                    {logoSrc
                      ? <img src={logoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : studioInitials(studio.name)}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="user-menu-name">{studio.name}</span>
                    <span className="user-menu-role">{t(`staff:roles.${studio.role}`, { defaultValue: studio.role })}</span>
                  </span>
                  {studio.is_current && (
                    <span className="user-menu-check">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </span>
                  )}
                  {switchingId === studio.id && <span className="user-menu-role">…</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="user-menu-sep" />

      <NavLink to="/dashboard/profile" role="menuitem" className="user-menu-item" onClick={onClose}>
        <span className="user-menu-logo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        </span>
        {t('menu:nav.profile')}
      </NavLink>

      <button type="button" role="menuitem" className="user-menu-item is-danger" disabled={isLoggingOut} onClick={() => handleLogout()}>
        <span className="user-menu-logo is-danger">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
        </span>
        {t('menu:userMenu.logout')}
      </button>
    </div>
  );
}

// Пилюля профиля внизу каркаса: клик раскрывает меню аккаунтов над ней,
// каретка разворачивается. Закрытие — клик вне, Esc или выбор пункта.
export function UserMenu() {
  const { t } = useTranslation('menu');
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      {open && <UserMenuPanel onClose={() => setOpen(false)} />}

      <button
        type="button"
        className="user-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('tooltips.openAccountMenu')}
        onClick={() => setOpen(v => !v)}
      >
        <div className="user-avatar">{getInitials(me?.name ?? '', me?.last_name)}</div>
        <div className="user-email">{me?.email ?? ''}</div>
        <span className="user-pill-caret">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </button>
    </div>
  );
}
