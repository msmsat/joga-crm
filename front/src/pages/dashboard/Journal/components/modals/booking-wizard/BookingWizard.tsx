// Запись по разделам — те же стили, что у формы нового занятия (.keypad-modal).
// На телефоне — лист снизу почти во весь экран: каждый раздел — это список, и
// ему нужно место. На компьютере — окно по центру (карточка клиента): та же
// последовательность, подогнанная под курсор (Journal.css, раздел 14b).
// Разделы открываются кнопками в шапке (WizardTabs) в любом порядке, а свайп
// по листу листает их по очереди. Логика — useBookingWizard.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../../components/Icons';
import {
  useBookingWizard, CLIENT_STEP, MASTER_STEP, SERVICE_STEP, SUMMARY_STEP, TIME_STEP, type WizardOptions,
} from './useBookingWizard';
import { ClientStep, MasterStep, ServiceStep } from './WizardSteps';
import { TimeStep } from './TimeStep';
import { WhenChip } from './WhenPicker';
import { useGridSwipe } from '../../../hooks/useGridSwipe';
import { SummaryStep } from './SummaryStep';
import { formatMoney } from '../../../../../../lib/money';
import { NewClientStep } from './NewClientStep';
import { WizardTabs } from './WizardTabs';
import { ConfirmModal } from '../../../../../../components/ui/index';

const TITLES = ['wizard.when', 'wizard.client', 'wizard.service', 'wizard.master', 'wizard.summary'] as const;
/** Касания, которые не листают разделы: ряды, что сами едут вбок, и поля ввода. */
const NO_SWIPE = '.jf-chips, .bw-days, input, textarea, select';

export function BookingWizard(props: WizardOptions) {
  const { t, i18n } = useTranslation(['journal', 'common', 'clients']);
  const w = useBookingWizard(props);
  // «+ Новый клиент»: лист показывает форму клиента вместо списка.
  const [creating, setCreating] = useState(false);
  const { onClose } = props;
  const { saving } = w;
  // Поверх записи открыт вопрос про прошедшее время или окно оплаты — Escape их.
  const asking = w.pastAsk != null || w.settle.open;
  // Escape — как у остальных окон: из формы клиента — назад к списку; пока
  // запись уходит, окно не закрывается. Пока открыт вопрос про прошедшее
  // время, Escape — его ответ «Выбрать своё», а не закрытие записи.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || saving || asking) return;
      if (creating) setCreating(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving, creating, asking]);
  // Свайп влево — следующий раздел, вправо — предыдущий.
  const sheetRef = useRef<HTMLDivElement>(null);
  useGridSwipe(sheetRef, !creating && !saving, w.swipe, { ignore: NO_SWIPE, phoneOnly: false });
  const when = <WhenChip w={w} />;

  // Итог — дом мастера: из любого раздела «назад» ведёт на него.
  const index = w.steps.indexOf(w.step);
  const back = creating ? () => setCreating(false)
    : w.step !== SUMMARY_STEP ? () => w.goTo(SUMMARY_STEP) : null;

  // Что уже выбрано — строкой под заголовком. День и время тут не повторяются:
  // они на кнопке над списком. На итоге всё и так перечислено.
  const master = w.masterChosen ? w.masters.find(m => m.id === w.teacherId)?.name : undefined;
  const picked = w.step === SUMMARY_STEP || creating ? '' : [
    w.step !== CLIENT_STEP && w.needsClient ? w.clientName : null,
    w.step !== SERVICE_STEP ? w.service?.name : null,
    w.step !== MASTER_STEP ? master : null,
  ].filter(Boolean).join(' · ');

  // Подвал: выбор строки и так ведёт дальше, а «Продолжить» — для того, что
  // уже выбрано (заведённый здесь клиент, возврат на шаг кнопкой в шапке).
  const canContinue = w.done(w.step);
  const showFoot = w.step === SUMMARY_STEP || canContinue;
  const payable = w.ready && (!w.isResource || w.settle.ready);
  // Снимок заметки ещё грузится — подтверждать рано, он бы не попал в запись.
  const confirmable = payable && !w.notePending;
  // ConfirmModal после «Продолжить» зовёт и onClose — отличаем его от
  // «Выбрать своё», иначе принятый час тут же сменился бы разделом «Время».
  const pastAccepted = useRef(false);
  const pastDay = w.pastAsk && new Date(`${w.pastAsk.date}T12:00:00`)
    .toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });

  return createPortal(
    <>
      <div className="kp-backdrop bw-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 200 }}
           onMouseDown={() => { if (!w.saving) props.onClose(); }} />
      <div className="kp-anchor bw-anchor" style={{ position: 'fixed', zIndex: 210 }} onMouseDown={e => e.stopPropagation()}>
        <div className="keypad-modal bw-sheet" ref={sheetRef}>
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

          {/* Кнопки шагов — и прогресс, и переход: сделанное светится зелёным. */}
          {!creating && <WizardTabs w={w} payable={payable} />}

          {creating ? (
            <NewClientStep onCreated={(id, name, hint) => { w.addFreshClient(id, name, hint); setCreating(false); }} />
          ) : (
            <>
              {/* key — раздел заново въезжает с той стороны, куда листнули. */}
              <div key={w.step} className={`bw-body ${w.dir > 0 ? 'bw-in-next' : 'bw-in-prev'}`}>
                {w.step === TIME_STEP && <TimeStep w={w} />}
                {w.step === CLIENT_STEP && <ClientStep w={w} when={when} onCreate={() => setCreating(true)} />}
                {w.step === SERVICE_STEP && <ServiceStep w={w} when={when} />}
                {w.step === MASTER_STEP && <MasterStep w={w} when={when} />}
                {w.step === SUMMARY_STEP && <SummaryStep w={w} />}
              </div>

              {showFoot && (
                <div className="kp-foot">
                  {w.step === SUMMARY_STEP ? (
                    // Выбрали на итоге «Оплату» — деньги принимаются вместе с
                    // записью: сумму, которую примут, сервер сверяет с чеком.
                    // Кнопка её и называет. Без оплаты — просто «Подтвердить».
                    <button type="button" className="btn-primary-sm" disabled={!confirmable || w.saving}
                            style={{ opacity: !confirmable || w.saving ? 0.5 : 1 }} onClick={() => void w.submit()}>
                      {w.isResource && w.settle.amount
                        ? t('journal:payment.confirmAndPay', { amount: formatMoney(w.settle.amount, w.settle.check.preview?.currency ?? '') })
                        : t('journal:wizard.confirm')}
                    </button>
                  ) : (
                    <button type="button" className="btn-primary-sm" disabled={!canContinue}
                            style={{ opacity: canContinue ? 1 : 0.5 }} onClick={w.advance}>
                      {t('common:buttons.continue')}
                      {/* На «Времени» кнопка называет время — это и есть «подтвердить» выбранное тапом. */}
                      {w.step === TIME_STEP && <span className="bw-foot-time">{w.time}</span>}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {w.pastAsk && (
        <ConfirmModal
          title={t('journal:wizard.past.title')}
          message={t('journal:wizard.past.message', { date: pastDay, time: w.pastAsk.time })}
          confirmText={t('common:buttons.continue')}
          cancelText={t('journal:wizard.past.own')}
          onConfirm={() => { pastAccepted.current = true; w.acceptPast(); }}
          onClose={() => { if (!pastAccepted.current) w.choosePastOwn(); }}
        />
      )}
    </>,
    document.body,
  );
}
