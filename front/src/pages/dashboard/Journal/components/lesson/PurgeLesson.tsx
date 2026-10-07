// «Удалить из журнала» в попапе отменённого занятия. Кнопка подвала на месте
// раскрывается в подтверждение: модалка поверх попапа закрыла бы то самое
// занятие, о котором спрашивают, а вопрос без него перед глазами — вслепую.
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import './purgeLesson.css';

interface PurgeLessonProps {
  /** Убрать занятие из сетки. Попап закрывает вызывающий; false — не вышло (отказ
   *  сервера уже показан тостом), и подтверждение сворачивается в кнопку. */
  onPurge: () => Promise<boolean>;
}

export function PurgeLesson({ onPurge }: PurgeLessonProps) {
  const { t } = useTranslation('journal');
  const [step, setStep] = useState<'idle' | 'ask' | 'busy'>('idle');
  const titleId = useId();
  const textId = useId();
  const busy = step === 'busy';

  const purge = async () => {
    setStep('busy');
    if (!(await onPurge())) setStep('idle');
  };

  if (step === 'idle') {
    return (
      <div className="bp-actions">
        <button type="button" className="bp-btn danger text-btn"
                onClick={e => { e.stopPropagation(); setStep('ask'); }}>
          <Icons.Trash /> {t('bookingPopup.purge.action')}
        </button>
      </div>
    );
  }

  return (
    <div
      className="bp-purge"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={textId}
      onKeyDown={e => {
        if (e.key !== 'Escape' || busy) return;
        e.stopPropagation();
        setStep('idle');
      }}
      // Невысокий экран: попап прокручивается, и вопрос с кнопками уходил бы
      // за его нижний край. Довозим его в вид, когда панель встала на место.
      onAnimationEnd={e => {
        if (e.target === e.currentTarget) e.currentTarget.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }}
    >
      <div className="bp-purge-head">
        <span className="bp-purge-ic" aria-hidden><Icons.Trash /></span>
        <div className="bp-purge-copy">
          <div id={titleId} className="bp-purge-title">{t('bookingPopup.purge.title')}</div>
          <p id={textId} className="bp-purge-text">{t('bookingPopup.purge.message')}</p>
        </div>
      </div>
      <div className="bp-purge-foot">
        {/* Фокус — на безопасном ответе: Enter по привычке занятие не сотрёт. */}
        <button type="button" className="bp-btn ghost text-btn" disabled={busy} autoFocus
                onClick={e => { e.stopPropagation(); setStep('idle'); }}>
          {t('bookingPopup.purge.keep')}
        </button>
        <button type="button" className="bp-btn text-btn bp-purge-go" disabled={busy} aria-busy={busy}
                onClick={e => { e.stopPropagation(); void purge(); }}>
          {busy
            ? <><span className="spinner" aria-hidden /> {t('bookingPopup.purge.deleting')}</>
            : t('bookingPopup.purge.confirm')}
        </button>
      </div>
    </div>
  );
}
