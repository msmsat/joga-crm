import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ClientFormState } from '../../hooks/useClientForm';
import { useAddClient } from '../../hooks/useAddClient';
import { usePhone } from '../../../../../hooks/usePhone';
import { useSheetDrag } from '../../../../../components/ui/modal/sheetDrag';
import { submitOnEnter } from '../../../../../lib/submitOnEnter';
import { StepMembership, StepPersonal, StepProfile, StepSummary } from './addClient/sections';
import { WizardAside } from './addClient/WizardAside';
import s from './AddClientModal.module.css';

export interface AddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (form: ClientFormState) => void;
}

const TOTAL = 4;
const EXIT_MS = 200;

// «Новый клиент». Обязательно только имя — клиента узнают по номеру, который
// выдаёт студия, всё остальное по желанию.
//   Большой экран — мастер из четырёх шагов с иллюстрацией слева.
//   Телефон — ОДНА прокручиваемая форма в шите снизу: четыре экрана подряд с
//   кнопкой «Продолжить» пальцем проходить долго, а клиента по одному имени
//   надо заводить в одно касание.
export function AddClientModal({ isOpen, onClose, onSuccess }: AddClientModalProps) {
  return isOpen ? <AddClientDialog onClose={onClose} onSuccess={onSuccess}/> : null;
}

function AddClientDialog({ onClose, onSuccess }: Omit<AddClientModalProps, 'isOpen'>) {
  const { t } = useTranslation('clients');
  const isPhone = usePhone();
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const [leaving, setLeaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const exitTimer = useRef<number | undefined>(undefined);

  // Уход с анимацией (на телефоне шит уезжает вниз), затем размонтирование.
  const leaveThen = (after: () => void) => {
    if (exitTimer.current !== undefined) return;
    setLeaving(true);
    exitTimer.current = window.setTimeout(after, EXIT_MS);
  };

  // Форма чистится ПОСЛЕ ухода: иначе поля пустели бы у человека на глазах.
  const ac = useAddClient(!leaving, form => leaveThen(() => { onSuccess(form); onClose(); }));
  const requestClose = () => { if (!ac.saving) leaveThen(onClose); };

  useSheetDrag(cardRef, requestClose, !ac.saving && !leaving);
  useEffect(() => () => window.clearTimeout(exitTimer.current), []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cardRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!isPhone || !viewport) return;
    const resize = () => {
      overlayRef.current?.style.setProperty('--ac-viewport-height', `${viewport.height}px`);
      overlayRef.current?.style.setProperty('--ac-viewport-top', `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', resize);
    };
  }, [isPhone]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const canGoNext = step !== 1 || (!!ac.form.name.trim() && !ac.contactsBlocked);
  const validateVisibleFields = () => {
    const fields = bodyRef.current?.querySelectorAll<HTMLInputElement>('input') ?? [];
    return Array.from(fields).every(field => field.reportValidity());
  };
  const goNext = () => {
    if (leaving || ac.saving || !canGoNext || (step === 1 && !ac.validate())) return;
    if (!validateVisibleFields()) return;
    setDir(1);
    setStep(n => Math.min(TOTAL, n + 1));
  };
  const goBack = () => { setDir(-1); setStep(n => Math.max(1, n - 1)); };

  // Ошибка может оказаться ниже края шита — показываем её, а не молчим.
  const submitPhone = () => {
    if (ac.validate() && validateVisibleFields() && ac.submit()) return;
    requestAnimationFrame(() => bodyRef.current
      ?.querySelector('[aria-invalid="true"]')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };

  // Телефон: Enter на клавиатуре ведёт к следующему полю, как «Далее» в
  // нативных формах; на последнем — добавляет клиента.
  const onKeyDown = (e: KeyboardEvent) => {
    if (leaving || ac.saving) return;
    if (e.key === 'Tab') {
      const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)',
      )).filter(el => el.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (e.shiftKey && (e.target === first || e.target === e.currentTarget)) {
        e.preventDefault(); last?.focus();
      } else if (!e.shiftKey && e.target === last) {
        e.preventDefault(); first?.focus();
      }
      return;
    }
    submitOnEnter(isPhone ? event => {
      const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not([type=hidden]):not(:disabled), textarea:not(:disabled)'));
      const next = fields[fields.indexOf(event.target as HTMLElement) + 1];
      if (next) next.focus(); else submitPhone();
    } : step < TOTAL ? (canGoNext ? goNext : null) : ac.submit)(e);
  };

  return createPortal(
    <div ref={overlayRef} className={`${s.overlay} v-overlay${leaving ? ' is-leaving' : ''}`} onClick={requestClose}>
      <div
        ref={cardRef}
        // .v-modal-steps только у мастера: на телефоне левой панели нет, и
        // лишняя строка грида оставила бы форму без высоты.
        className={`${s.dialog} v-modal v-modal-lg v-modal-wizard${isPhone ? '' : ' v-modal-steps'}`}
        role="dialog"
        tabIndex={-1}
        aria-busy={ac.saving}
        aria-modal="true"
        aria-label={t('addModal.title')}
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          ['--v-modal-w' as string]: '780px',
          ['--v-left-w' as string]: '236px',
          ['--vm-wizard-h' as string]: '576px',
          background: 'var(--bg-card)', borderRadius: '24px', overflow: 'hidden',
          boxShadow: '0 40px 100px -20px rgba(26,26,26,0.28)',
        }}
      >
        {!isPhone && <WizardAside step={step} total={TOTAL} name={ac.form.name}/>}

        <div className={s.column}>
          <div className={s.head}>
            <span className={s.grabber} aria-hidden/>
            <div>
              <div className={s.headTitle}>{t('addModal.title')}</div>
              <div className={s.headSub}>{t('addModal.steps.1.sub')}</div>
            </div>
            <button type="button" className={s.close} onClick={requestClose} disabled={ac.saving || leaving} aria-label={t('addModal.cancel')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {isPhone ? (
            <div ref={bodyRef} inert={ac.saving || leaving} className={`${s.body} ms-scroll`}>
              <section className={s.section}>
                <StepPersonal ac={ac}/>
              </section>
              <section className={s.section}>
                <h3 className={s.sectionTitle}>{t('addModal.steps.2.title')}</h3>
                <StepProfile ac={ac}/>
              </section>
              <section className={s.section}>
                <h3 className={s.sectionTitle}>{t('addModal.steps.3.title')}</h3>
                <StepMembership ac={ac}/>
              </section>
            </div>
          ) : (
            <div
              ref={bodyRef}
              inert={ac.saving || leaving}
              key={step}
              className={`${s.body} ${s.stepIn} ms-scroll`}
              style={{ ['--ac-dir' as string]: dir }}
            >
              {step === 1 && <StepPersonal ac={ac}/>}
              {step === 2 && <StepProfile ac={ac}/>}
              {step === 3 && <StepMembership ac={ac}/>}
              {step === 4 && <StepSummary ac={ac}/>}
            </div>
          )}

          <div className={s.foot}>
            {isPhone ? (
              <button type="button" className={s.btnFinish} onClick={submitPhone} disabled={!ac.canSubmit}>
                {ac.saving && <span className={s.spinner}/>}
                {t('addModal.submit')}
              </button>
            ) : (
              <>
                <button type="button" className={s.btnGhost} disabled={ac.saving || leaving} onClick={step === 1 ? requestClose : goBack}>
                  {step === 1 ? t('addModal.cancel') : t('addModal.back')}
                </button>
                <div className={s.footRight}>
                  <span className={s.counter}>{step} / {TOTAL}</span>
                  {step < TOTAL ? (
                    <button type="button" className={s.btnPrimary} onClick={goNext} disabled={!canGoNext}>
                      {t('addModal.continue')}
                    </button>
                  ) : (
                    <button type="button" className={s.btnFinish} onClick={ac.submit} disabled={!ac.canSubmit}>
                      {ac.saving && <span className={s.spinner}/>}
                      {t('addModal.submit')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
