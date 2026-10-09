import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const firstName = (full?: string) => full?.trim().split(/\s+/)[0] ?? '';
const initials = (full?: string) =>
  (full ?? '').trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();

type SlabProps = {
  /** Кто вёл занятие: записка адресована ему по имени. */
  teacher?: string;
  /** Цвет его аватара — тот же, что в листе занятия. */
  color?: string;
  /** Есть — строка адреса подписывает это поле: тап по ней ставит курсор. */
  labelFor?: string;
  /** Вместо адреса — короткое «Отправлено — спасибо!» сразу после отправки. */
  status?: string;
  /** Записка ушла: на аватаре адресата — галочка. */
  delivered?: boolean;
  /** Правый край шапки: карандаш в прочтении. */
  corner?: ReactNode;
  className?: string;
  children: ReactNode;
};

/**
 * Записка тренеру — матовый тёмный камень с зерном, тот же материал, что у
 * линзы нижней капсулы. Свет студии тлеет в нём снизу у отправки и
 * разгорается, когда пишут. Правка и прочтение — один и тот же предмет:
 * шапка с адресатом одной высоты в обоих, в прочтении справа — карандаш.
 *
 * Адресат по имени, а не «тренер»: у барбершопа это мастер, у студии —
 * инструктор, а имя верно везде.
 */
export function NoteSlab({ teacher, color, labelFor, status, delivered, corner, className = '', children }: SlabProps) {
  const { t } = useTranslation();
  const name = firstName(teacher);
  const to = name ? t('mylessons.review.to', { name }) : t('mylessons.review.to_studio');
  return (
    <div className={`rv ${className}`}>
      <div className="rv-head">
        <span className={`rv-avatar ${delivered ? 'rv-avatar-done' : ''}`} style={{ background: color || 'var(--v-brand)' }} aria-hidden="true">
          {initials(teacher)}
          {delivered && (
            <span className="rv-avatar-ok">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6.3l2 2 4-4.3" />
              </svg>
            </span>
          )}
        </span>
        {status ? (
          <span key="status" role="status" className="rv-label rv-label-status">{status}</span>
        ) : labelFor ? (
          <label htmlFor={labelFor} className="rv-label">{to}</label>
        ) : (
          <span className="rv-label">{to}</span>
        )}
        {corner && <div className="rv-corner">{corner}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * «Фото» — та же плитка, что в заметках CRM (NotePhotos): пунктирная рамка,
 * плюс и подпись. Стоит в ряду снимков последней, как там: новый кадр
 * встаёт перед ней, и она сама показывает, куда он ляжет.
 */
export function AddPhotoTile({ label, text, onClick }: { label: string; text: string; onClick: () => void }) {
  return (
    // Обёртка — контейнер для запроса по ширине: узкой плитке подпись не нужна.
    <span className="rv-add-wrap">
      <button type="button" onClick={onClick} aria-label={label} className="rv-add">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span aria-hidden="true">{text}</span>
      </button>
    </span>
  );
}

/**
 * Снимок записки. Пока файл летит на сервер, кадр «проявляется»: размыт,
 * обесцвечен и притушен, а когда загрузка кончилась — становится чётким.
 * Проявка привязана к самой загрузке, а не к таймеру.
 */
export function Thumb({ src, pending, enter, label, onClick }: {
  src: string;
  pending?: boolean;
  /** Только что выбран — вкладывается в ряд с движением. */
  enter?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-pending={pending || undefined}
      className={`rv-thumb ${enter ? 'rv-thumb-in' : ''}`}
    >
      <img src={src} alt="" draggable={false} className="rv-thumb-img" />
    </button>
  );
}

/** Отправка — светлая фарфоровая клавиша на камне, подсвеченная студией.
 *  Пока слать нечего — только контур. */
export function SendButton({ ready, busy, label, onClick }: { ready: boolean; busy: boolean; label: string; onClick: () => void }) {
  return (
    <button
      key={ready ? 'ready' : 'idle'}
      type="button"
      onClick={onClick}
      disabled={!ready || busy}
      aria-label={label}
      className={`rv-send ${ready ? '' : 'rv-send-idle'}`}
    >
      {busy ? (
        <span className="memo-spin h-4 w-4 rounded-full border-2 border-current/30 border-t-current" />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" className="h-[18px] w-[18px]">
          <path d="M20.6 3.4L3.7 10.1c-.75.3-.72 1.37.05 1.62l6.4 2.07 2.07 6.4c.25.77 1.32.8 1.62.05L20.6 3.4z" />
          <path d="M10.15 13.8l4.6-4.6" />
        </svg>
      )}
    </button>
  );
}

/** Вернуть записку в правку — карандаш в углу шапки. */
export function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="rv-edit-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]" aria-hidden="true">
        <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
        <path d="M13.5 6.5l4 4" />
      </svg>
    </button>
  );
}
