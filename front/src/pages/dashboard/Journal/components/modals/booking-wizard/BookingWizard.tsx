// Запись по шагам — те же стили, что у формы нового занятия (.keypad-modal).
// На телефоне — лист снизу почти во весь экран: каждый шаг — это список, и
// ему нужно место. На компьютере — окно по центру (карточка клиента): та же
// последовательность, подогнанная под курсор (Journal.css, раздел 14b).
// Логика — useBookingWizard.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../../components/Icons';
import {
  useBookingWizard, CLIENT_STEP, MASTER_STEP, SERVICE_STEP, SUMMARY_STEP, WHEN_STEP, type WizardOptions,
} from './useBookingWizard';
import { ClientStep, MasterStep, ServiceStep } from './WizardSteps';
import { WhenStep } from './WhenStep';
import { SummaryStep } from './SummaryStep';
import { confirmLabel } from '../../../hooks/useBookingPayment';
import { NewClientStep } from './NewClientStep';

const TITLES = ['wizard.when', 'wizard.client', 'wizard.service', 'wizard.master', 'wizard.check'] as const;

export function BookingWizard(props: WizardOptions) {
  const { t, i18n } = useTranslation(['journal', 'common', 'clients']);
  const w = useBookingWizard(props);
  // «+ Новый клиент»: лист показывает форму клиента вместо списка.
  const [creating, setCreating] = useState(false);
  const { onClose } = props;
  const { saving } = w;
  // Escape — как у остальных окон: из формы клиента — назад к списку;
  // пока запись уходит, окно не закрывается.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || saving) return;
      if (creating) setCreating(false); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving, creating]);

  const index = w.steps.indexOf(w.step);
  const back = creating ? () => setCreating(false)
    : index > 0 ? () => w.goTo(w.steps[index - 1]) : null;

  // Что уже выбрано — строкой под заголовком: день и время первыми, как их
  // назвал человек. На проверке всё и так перечислено — строку не дублируем.
  const day = w.date
    ? new Date(`${w.date}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })
    : '';
  const master = w.masterChosen ? w.masters.find(m => m.id === w.teacherId)?.name : undefined;
  const picked = w.step === SUMMARY_STEP || creating ? '' : [
    w.time ? `${day}, ${w.time}` : day,
    w.step !== CLIENT_STEP ? w.clientName : null,
    w.step !== SERVICE_STEP ? w.service?.name : null,
    w.step !== MASTER_STEP ? master : null,
  ].filter(Boolean).join(' · ');

  // Подвал: время подтверждают «Продолжить»; на остальных шагах выбор строки
  // и так ведёт дальше, а «Продолжить» — для того, что уже выбрано.
  const canContinue = w.done(w.step);
  const showFoot = w.step === SUMMARY_STEP || w.step === WHEN_STEP || canContinue;
  const payable = w.ready && (!w.isResource || w.resource.payment.ready);

  return createPortal(
    <>
      <div className="kp-backdrop bw-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 200 }}
           onMouseDown={() => { if (!w.saving) props.onClose(); }} />
      <div className="kp-anchor bw-anchor" style={{ position: 'fixed', zIndex: 210 }} onMouseDown={e => e.stopPropagation()}>
        <div className="keypad-modal bw-sheet">
          <div className="kp-head bw-head">
            <div className="kp-head-l">
              {back ? (
                <button type="button" className="btn-icon" onClick={back} disabled={w.saving}
                        aria-label={t('common:buttons.back')}>
                  <Icons.ChevronLeft />
                </button>
              ) : (
                <div className="kp-head-icon"><Icons.Plus /></div>
              )}
              <div style={{ minWidth: 0 }}>
                <div className="kp-head-title">
                  {creating ? t('clients:addModal.title') : t(`journal:${TITLES[w.step]}`)}
                </div>
                {!creating && (
                  <div className="kp-head-sub bw-picked">
                    <span className="bw-step">{t('journal:wizard.step', { n: index + 1, total: w.steps.length })}</span>
                    {picked && <> · {picked}</>}
                  </div>
                )}
              </div>
            </div>
            <button type="button" className="btn-icon" onClick={props.onClose} disabled={w.saving}
                    aria-label={t('common:buttons.close')}><Icons.X /></button>
          </div>

          {/* Полоски — это и прогресс, и переход: тап по полоске ведёт на её шаг,
              если всё, что перед ним, уже выбрано. */}
          {!creating && (
            <nav className="bw-progress" aria-label={t('journal:wizard.step', { n: index + 1, total: w.steps.length })}>
              {w.steps.map((s, i) => (
                <button key={s} type="button" disabled={s === w.step || !w.canJump(s) || w.saving}
                        className={`${i <= index ? 'on' : ''}${s === w.step ? ' current' : ''}`}
                        title={t(`journal:${TITLES[s]}`)} aria-label={t(`journal:${TITLES[s]}`)}
                        aria-current={s === w.step ? 'step' : undefined}
                        onClick={() => w.goTo(s)}>
                  <span />
                </button>
              ))}
            </nav>
          )}

          {creating ? (
            <NewClientStep onCreated={(id, name, hint) => { w.addFreshClient(id, name, hint); setCreating(false); }} />
          ) : (
            <>
              <div className="bw-body">
                {w.step === WHEN_STEP && <WhenStep w={w} />}
                {w.step === CLIENT_STEP && <ClientStep w={w} onCreate={() => setCreating(true)} />}
                {w.step === SERVICE_STEP && <ServiceStep w={w} />}
                {w.step === MASTER_STEP && <MasterStep w={w} />}
                {w.step === SUMMARY_STEP && <SummaryStep w={w} canChangeClient={props.clientId == null} />}
              </div>

              {showFoot && (
                <div className="kp-foot">
                  {w.step === SUMMARY_STEP ? (
                    // Индивидуальная запись подтверждается вместе с оплатой:
                    // нужен чек под нынешние условия — сумму, которую примут
                    // наличными, сервер сверяет с ним. Кнопка её и называет.
                    <button type="button" className="btn-primary-sm" disabled={!payable || w.saving}
                            style={{ opacity: !payable || w.saving ? 0.5 : 1 }} onClick={() => void w.submit()}>
                      {w.isResource ? confirmLabel(w.resource.payment, t, t('journal:wizard.confirm'))
                        : t('journal:wizard.confirm')}
                    </button>
                  ) : (
                    <button type="button" className="btn-primary-sm" disabled={!canContinue}
                            style={{ opacity: canContinue ? 1 : 0.5 }} onClick={w.advance}>
                      {t('common:buttons.continue')}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
