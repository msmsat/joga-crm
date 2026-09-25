// Запись на телефоне по шагам — тот же лист снизу и те же стили, что у формы
// нового занятия (.keypad-modal), только высотой почти во весь экран: каждый
// шаг — это список, и ему нужно место. Логика — useBookingWizard.
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../../components/Icons';
import { useBookingWizard, SUMMARY_STEP, WIZARD_STEPS, type WizardOptions } from './useBookingWizard';
import { ClientStep, MasterStep, ServiceStep } from './WizardSteps';
import { WhenStep } from './WhenStep';
import { SummaryStep } from './SummaryStep';

const TITLES = ['wizard.client', 'wizard.service', 'wizard.master', 'wizard.when', 'wizard.check'] as const;

export function BookingWizard(props: WizardOptions) {
  const { t } = useTranslation(['journal', 'common']);
  const w = useBookingWizard(props);
  const firstStep = props.clientId != null ? 1 : 0;

  // Что уже выбрано — строкой под заголовком: видно, куда вернёшься «назад».
  const master = w.masters.find(m => m.id === w.teacherId);
  // На проверке всё и так перечислено — строку не дублируем.
  const picked = w.step === SUMMARY_STEP ? '' : [
    w.step > 0 ? w.clientName : null,
    w.step > 1 ? w.service?.name : null,
    w.step > 2 ? master?.name : null,
  ].filter(Boolean).join(' · ');

  return createPortal(
    <>
      <div className="kp-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 200 }}
           onMouseDown={() => { if (!w.saving) props.onClose(); }} />
      <div className="kp-anchor" style={{ position: 'fixed', zIndex: 210 }} onMouseDown={e => e.stopPropagation()}>
        <div className="keypad-modal bw-sheet">
          <div className="kp-head">
            <div className="kp-head-l">
              {w.step > firstStep ? (
                <button type="button" className="btn-icon" onClick={() => w.goTo(w.step - 1)} disabled={w.saving}
                        aria-label={t('common:buttons.back')}>
                  <Icons.ChevronLeft />
                </button>
              ) : (
                <div className="kp-head-icon"><Icons.Plus /></div>
              )}
              <div style={{ minWidth: 0 }}>
                <div className="kp-head-title">{t(`journal:${TITLES[w.step]}`)}</div>
                <div className="kp-head-sub bw-picked">
                  <span className="bw-step">{t('journal:wizard.step', { n: w.step + 1, total: WIZARD_STEPS })}</span>
                  {picked && <> · {picked}</>}
                </div>
              </div>
            </div>
            <button type="button" className="btn-icon" onClick={props.onClose} disabled={w.saving}><Icons.X /></button>
          </div>

          <div className="bw-progress">
            {Array.from({ length: WIZARD_STEPS }, (_, i) => <span key={i} className={i <= w.step ? 'on' : ''} />)}
          </div>

          <div className="bw-body">
            {w.step === 0 && <ClientStep w={w} />}
            {w.step === 1 && <ServiceStep w={w} />}
            {w.step === 2 && <MasterStep w={w} />}
            {w.step === 3 && <WhenStep w={w} />}
            {w.step === SUMMARY_STEP && <SummaryStep w={w} canChangeClient={props.clientId == null} />}
          </div>

          {/* Время выбрано — дальше проверка; на проверке — сама запись. */}
          {w.step >= 3 && (
            <div className="kp-foot">
              <button type="button" className="btn-primary-sm" disabled={!w.ready || w.saving}
                      style={{ opacity: !w.ready || w.saving ? 0.5 : 1 }}
                      onClick={() => { if (w.step === SUMMARY_STEP) void w.submit(); else w.goTo(SUMMARY_STEP); }}>
                {w.step === SUMMARY_STEP ? t('journal:wizard.confirm') : t('common:buttons.continue')}
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
