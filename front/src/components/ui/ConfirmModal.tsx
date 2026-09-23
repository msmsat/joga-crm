import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;              // красная кнопка + иконка-предупреждение (по умолчанию false — нейтральный)
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

// Общая модалка подтверждения на всё приложение (замена window.confirm).
// Пока onConfirm летит — кнопка в состоянии загрузки, модалка не закрывается;
// закрывается по успешному завершению, остаётся открытой при ошибке (тост покажет).
export function ConfirmModal({ title, message, confirmText, cancelText, danger = false, onConfirm, onClose }: ConfirmModalProps) {
  const { t } = useTranslation('common');
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (busy) return;
    try {
      setBusy(true);
      await onConfirm();
      onClose();
    } catch {
      // Ошибку показывает вызывающий код (тост); модалка остаётся открытой.
      setBusy(false);
    }
  };

  // Esc закрывает, Enter подтверждает (как у нативного confirm) — но не во время
  // запроса, чтобы не бросить операцию на полпути и не послать её дважды.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void handleConfirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // handleConfirm пересоздаётся каждый рендер — в зависимостях достаточно busy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, onClose]);

  // Текст согласия может быть длиннее экрана и тогда прокручивается. Чтобы
  // обрезанная кромкой строка не читалась как «текст кончился», край гасится
  // маской — но только тот, за которым ещё есть содержимое: доскроллил до низа,
  // и последняя строка снова чёткая. Поэтому позиция скролла нужна состоянием,
  // одним CSS (mask не умеет background-attachment: local) это не выражается.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });

  const syncFade = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight > 2;
    setFade(prev => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);

  // ResizeObserver, а не одно измерение при открытии: высота области меняется и
  // от длины текста, и от вьюпорта (поворот планшета, адресная строка Safari).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    syncFade();
    const ro = new ResizeObserver(syncFade);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncFade, message]);

  const maskImage = fade.top || fade.bottom
    ? `linear-gradient(to bottom, ${fade.top ? 'transparent 0, #000 24px' : '#000 0'}, ${fade.bottom ? '#000 calc(100% - 28px), transparent 100%' : '#000 100%'})`
    : undefined;

  const accent = danger ? '#D88C9A' : '#F9A08B';
  const accentDark = danger ? '#C07080' : '#E8886F';
  const accentRgb = danger ? '216,140,154' : '249,160,139';

  return createPortal(
    <div
      className="v-overlay"
      onClick={() => { if (!busy) onClose(); }}
      style={{ zIndex: 9999 }}
    >
      <div
        className="v-modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card, #FFFFFF)', width: '100%', maxWidth: '400px',
          borderRadius: '24px',
          // Высота — по контенту, но не выше экрана. Длинное согласие (условия
          // процентного тарифа — пять абзацев) выносило карточку за край
          // вьюпорта, а .v-overlay position:fixed не скроллится: текст обрывался
          // на полуслове, а кнопки «Отмена»/«Подтвердить» были недосягаемы —
          // подтвердить условия было физически нельзя. Скроллится только текст
          // (см. ниже), поэтому заголовок и кнопки всегда на месте.
          // dvh, а не vh: в Safari на телефоне 100vh — экран со свёрнутой
          // адресной строкой, и подвал ушёл бы под её край.
          maxHeight: 'calc(100dvh - 32px)', overflow: 'hidden',
          boxShadow: '0 24px 48px -12px rgba(26,26,26,0.15), 0 0 0 1px rgba(26,26,26,0.04)',
          display: 'flex', flexDirection: 'column',
          fontFamily: "'Manrope', sans-serif",
        }}
      >
        {/* Шапка: не сжимается и не уезжает вместе с текстом. */}
        <div style={{ flexShrink: 0, padding: '32px 32px 0' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%', marginBottom: '20px',
            background: `linear-gradient(135deg, rgba(${accentRgb},0.2), rgba(${accentRgb},0.06))`,
            border: `1.5px solid rgba(${accentRgb},0.2)`, color: accentDark,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {danger ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            )}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text, #1A1A1A)', letterSpacing: '-0.3px' }}>
            {title}
          </div>
        </div>

        {/* Единственная прокручиваемая область модалки. minHeight: 0 —
            обязателен: без него flex-элемент не даёт себя сжать ниже контента,
            и overflow-y так и не включается. pre-line — абзацы в сообщении
            задаются переводами строки (см. billing.json mode.termsMessage), и
            без него пять абзацев склеивались в одну простыню. */}
        <div
          ref={bodyRef}
          className="ms-scroll"
          onScroll={syncFade}
          style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
            padding: '10px 32px 20px', whiteSpace: 'pre-line',
            fontSize: '14px', color: 'var(--text2, #666666)', lineHeight: 1.55,
            overscrollBehavior: 'contain',
            maskImage, WebkitMaskImage: maskImage,
          }}
        >
          {message}
        </div>

        {/* env(safe-area-inset-bottom) — на телефоне карточка становится шитом
            снизу (см. блок «ТЕЛЕФОН» в App.css), и кнопки попадали под
            индикатор жестов iPhone. На десктопе инсет равен нулю. */}
        <div style={{ flexShrink: 0, display: 'flex', gap: '12px', padding: '0 32px calc(32px + env(safe-area-inset-bottom, 0px))' }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1, padding: '13px', background: 'rgba(var(--ink),0.04)', color: 'var(--text2, #666666)',
              border: '1.5px solid rgba(var(--ink),0.08)', borderRadius: '12px',
              fontSize: '14px', fontWeight: 700, cursor: busy ? 'default' : 'pointer',
              transition: 'all 0.2s', fontFamily: 'inherit', opacity: busy ? 0.5 : 1,
            }}
          >
            {cancelText ?? t('buttons.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            style={{
              flex: 1, padding: '13px',
              background: `linear-gradient(135deg, ${accent}, ${accentDark})`,
              color: '#FFFFFF', border: 'none', borderRadius: '12px',
              fontSize: '14px', fontWeight: 700, cursor: busy ? 'default' : 'pointer',
              transition: 'all 0.2s', boxShadow: `0 8px 24px rgba(${accentRgb},0.3)`, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {busy && (
              <span style={{
                width: '15px', height: '15px', borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFFFFF',
                animation: 'cm-spin 0.6s linear infinite', display: 'inline-block',
              }} />
            )}
            {confirmText ?? t('buttons.delete')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
