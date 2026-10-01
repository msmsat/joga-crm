import { useTranslation } from 'react-i18next';
import type { BookingWizardFlow } from './useBookingWizard';
import { useServicePrice } from './useServicePrice';
import { useServiceDuration } from './useServiceDuration';
import { ANY, fullName } from '../lib/bookingPage';
import { formatDay, relativeDay, upperFirst } from '../lib/slots';
import { hhmm, type WizardPick } from '../lib/wizard';
import { money } from '../lib/money';

/**
 * Выбор записи словами — один источник для итога, колонки шагов и билета:
 * одно и то же время или мастер не должны называться в двух местах по-разному.
 *
 * `view` — выбор, который сейчас показываем: настоящий (`flow.pick`) или
 * примеряемый под мышью. Условия сервера (quote) относятся только к
 * настоящему — у примерки их ещё нет, и она говорит витринной ценой.
 */
export function useWizardWords(flow: BookingWizardFlow) {
  const { t, i18n } = useTranslation();
  const priceOf = useServicePrice();
  const durationOf = useServiceDuration();

  const quoteOf = (view: WizardPick) => (view === flow.pick ? flow.quote : null);
  const serviceOf = (view: WizardPick) => flow.services.find((row) => row.id === view.serviceId) ?? null;
  const memberOf = (view: WizardPick) =>
    typeof view.master === 'number' ? flow.staff.find((row) => row.teacher_id === view.master) ?? null : null;

  const day = (view: WizardPick) => {
    const relative = relativeDay(view.day, flow.today);
    return upperFirst(relative
      ? t(`booking.${relative}`)
      : formatDay(view.day, i18n.language, { weekday: 'short', day: 'numeric', month: 'long' }));
  };

  return {
    serviceOf,
    memberOf,
    day,
    when: (view: WizardPick): string | null => (view.time === null ? null : `${day(view)}, ${hhmm(view.time)}`),
    service: (view: WizardPick): string | null => {
      const service = serviceOf(view);
      return service ? t(`lesson.name.${service.name}`, { defaultValue: service.name }) : null;
    },
    /** «Любой» на итоге — уже конкретный человек: его назначил сервер в quote. */
    master: (view: WizardPick): string | null => {
      const quote = quoteOf(view);
      if (quote) return quote.terms.domain.trainer_name;
      if (view.master === ANY) return t('wizard.anyMaster');
      const member = memberOf(view);
      return member ? fullName(member) : null;
    },
    duration: (view: WizardPick): string | null => {
      const service = serviceOf(view);
      if (!service) return null;
      const quote = quoteOf(view);
      return quote ? t('booking.duration', { min: quote.terms.duration_min }) : durationOf(service, memberOf(view));
    },
    /** Цена — из quote, пока его нет — витринная цена услуги (у мастера — его). */
    price: (view: WizardPick): string | null => {
      const service = serviceOf(view);
      if (!service) return null;
      const funding = quoteOf(view)?.terms.domain.funding;
      if (funding) {
        return funding.kind === 'pay' ? money(funding.price, funding.currency, i18n.language) : t(`resource.funding.${funding.kind}`);
      }
      return priceOf(service, memberOf(view));
    },
  };
}
