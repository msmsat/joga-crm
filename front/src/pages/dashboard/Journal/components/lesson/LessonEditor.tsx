// Окно «Изменить занятие» — тело попапа журнала в режиме правки. Слева «что и
// когда» (услуга, название, день, время), справа «кто, где, сколько и почём»
// (тренер, зал, места, цена, уровень, инвентарь). Каждое изменённое поле
// помечено. Над полями — в какой фазе занятие (заморожено или уже прошло), в
// подвале — кого заденет правка (EditorConsequence).
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import { Input, Select, type SelectOption } from '../../../../../components/ui/index';
import { useRoleLabel } from '../../../../../hooks/useBusinessTerms';
import { getCurrencySymbol } from '../../../../../utils/currency';
import type { Booking, Hall, Trainer } from '../../types';
import { MAX_TIME_INDEX, MIN_TIME_INDEX } from '../../utils';
import {
  earliestStart, latestEnd, MAX_NAME, MAX_SHORT_TEXT, type DraftField, type LessonDraft,
} from './editor/editorModel';
import type { LessonEditorState } from './editor/useLessonEditor';
import { MatsCapacity } from './editor/MatsCapacity';
import { TimeControls } from './editor/TimeControls';
import { TrainerStrip } from './editor/TrainerStrip';
import { WeekStrip } from './editor/WeekStrip';
import './editor/lessonEditor.css';

interface Props {
  booking: Booking;
  draft: LessonDraft;
  setDraft: React.Dispatch<React.SetStateAction<LessonDraft>>;
  state: LessonEditorState;
  trainers: Trainer[];
  halls: Hall[];
  /** Место участвует в расписании (зал пилатеса) — его можно сменить. Где не
   *  участвует (кресло барбершопа), ряда мест нет, как в «Новом занятии». */
  showHalls: boolean;
  timeStep: number;
  currency?: string;
  serviceOptions: SelectOption[];
  onServiceChange: (value: string) => void;
  /** Смена тренера: попап решает, едет ли за ним цена (как сервер). */
  onTrainerChange: (trainer: number) => void;
}

export function LessonEditor({
  booking, draft, setDraft, state, trainers, halls, showHalls, timeStep, currency,
  serviceOptions, onServiceChange, onTrainerChange,
}: Props) {
  const { t } = useTranslation('journal');
  const roleLabel = useRoleLabel();
  const changed = (field: DraftField) => state.changes.includes(field);
  const patch = (next: Partial<LessonDraft>) => setDraft(d => ({ ...d, ...next }));
  const hall = halls.find(h => h.name === draft.hall);
  const frozen = state.phase === 'frozen';
  const duration = draft.timeEnd - draft.timeStart;

  // День закрыт, если занятие в нём не встанет: будущее — ближе последнего
  // момента для правки, прошедшее — позже «сейчас».
  const isClosed = (day: string) => {
    if (state.phase === 'finished') {
      const latest = latestEnd(day);
      return latest !== null && (latest === -Infinity || latest - duration < MIN_TIME_INDEX - 1e-6);
    }
    const earliest = earliestStart(day, state.leadMin);
    return earliest === Infinity || (earliest !== null && earliest > MAX_TIME_INDEX - duration);
  };

  return (
    <div className="le">
      <PhaseNotice state={state} booked={booking.clients} />

      {/* В заморозке закрыто всё, кроме мест: их меняют и за минуту до начала. */}
      <fieldset className="le-col le-lock" disabled={frozen}>
        <Field label={t('newBooking.service')} changed={changed('service')} error={state.errors.service}>
          {/* Попап занятия стоит на z-index 9000 (Journal.css) — список
              услуг обязан открываться над ним, а не под ним. */}
          <Select
            value={draft.serviceId != null ? String(draft.serviceId) : ''}
            options={serviceOptions}
            onChange={onServiceChange}
            placeholder={t('bookingPopup.errors.selectService')}
            layer={9100}
          />
        </Field>

        <Field label={t('bookingPopup.editor.name')} changed={changed('name')}>
          <Input value={draft.title} onChange={title => patch({ title: title.slice(0, MAX_NAME) })}
                 error={state.errors.name ?? undefined} />
        </Field>

        {draft.date && (
          <Field label={t('bookingPopup.editor.day')} changed={changed('date')}>
            <WeekStrip value={draft.date} original={booking.date} isClosed={isClosed}
                       onChange={date => patch({ date })} />
          </Field>
        )}

        <Field label={t('bookingPopup.editor.time')} changed={changed('time')} error={state.errors.time}>
          <TimeControls
            timeStart={draft.timeStart}
            timeEnd={draft.timeEnd}
            stepMin={timeStep}
            earliest={state.earliest}
            latestEnd={state.latestEnd}
            invalid={!!state.errors.time}
            onChange={patch}
          />
        </Field>
      </fieldset>

      <div className="le-col">
        <fieldset className="le-col le-lock" disabled={frozen}>
          {trainers.length > 0 && (
            <Field label={roleLabel('trainer')} changed={changed('trainer')}>
              <TrainerStrip trainers={trainers} value={draft.trainer} onChange={onTrainerChange} />
            </Field>
          )}

          {showHalls && halls.length > 0 && (
            <Field label={t('newBooking.location')} changed={changed('hall')}>
              <div className="le-halls">
                {halls.map(h => (
                  <button key={h.id} type="button"
                          className={`le-hall${draft.hall === h.name ? ' is-selected' : ''}`}
                          aria-pressed={draft.hall === h.name}
                          title={h.name}
                          onClick={() => patch({ hall: h.name })}>
                    <span className="le-hall-dot" style={{ background: h.color || 'var(--border2)' }} />
                    <span className="le-hall-name">{h.name}</span>
                  </button>
                ))}
              </div>
            </Field>
          )}
        </fieldset>

        <MatsCapacity
          value={draft.maxClients}
          original={booking.maxClients}
          booked={booking.clients}
          hallCapacity={showHalls ? hall?.capacity : null}
          error={state.errors.capacity}
          changed={changed('capacity')}
          onChange={maxClients => patch({ maxClients })}
        />

        <fieldset className="le-col le-lock" disabled={frozen}>
          <Field label={t('bookingPopup.editor.price')} changed={changed('price')}>
            <Input value={draft.price} inputMode="numeric" suffix={getCurrencySymbol(currency)}
                   error={state.errors.price ?? undefined}
                   onChange={price => patch({ price: price.replace(/\D/g, '').slice(0, 9), priceEdited: true })} />
            {state.reprices && <div className="le-caption">{t('bookingPopup.editor.repriced')}</div>}
          </Field>

          <Field label={t('bookingPopup.editor.level')} changed={changed('level')}>
            <Input value={draft.level} placeholder={t('bookingPopup.editor.levelPlaceholder')}
                   onChange={level => patch({ level: level.slice(0, MAX_SHORT_TEXT) })} />
          </Field>

          <Field label={t('bookingPopup.editor.equipment')} changed={changed('equipment')}>
            <Input value={draft.equipment} placeholder={t('bookingPopup.editor.equipmentPlaceholder')}
                   onChange={equipment => patch({ equipment: equipment.slice(0, MAX_SHORT_TEXT) })} />
          </Field>
        </fieldset>
      </div>
    </div>
  );
}

/** Почему занятие сейчас нельзя менять или почему правка будет тихой —
 *  одной строкой сверху, а не ошибкой под каждым полем. */
function PhaseNotice({ state, booked }: { state: LessonEditorState; booked: number }) {
  const { t } = useTranslation('journal');
  if (state.phase === 'open') return null;
  if (state.phase === 'finished') {
    return (
      <div className="le-notice is-past">
        <Icons.Clock />
        <span>{t('bookingPopup.editor.finished')}</span>
      </div>
    );
  }
  return (
    <div className="le-notice">
      <Icons.LockIcon />
      <span>{t(booked > 0 ? 'bookingPopup.editor.frozen' : 'bookingPopup.editor.frozenEmpty', { lead: state.leadLabel })}</span>
    </div>
  );
}

/** Правка уйдёт записанным уведомлением — говорим это над «Сохранить», где
 *  решение и принимают. */
export function EditorConsequence({ booked }: { booked: number }) {
  const { t } = useTranslation('journal');
  return (
    <div className="le-consequence">
      <Icons.Bell />
      <span>{t('bookingPopup.editor.notify', { booked })}</span>
    </div>
  );
}

function Field({ label, changed, error, children }: {
  label: string; changed: boolean; error?: string | null; children: React.ReactNode;
}) {
  const { t } = useTranslation('journal');
  return (
    <div className="le-field">
      <span className="le-label">
        {label}
        {changed && <span className="le-changed" title={t('bookingPopup.editor.changed')} />}
      </span>
      {children}
      {error && <div className="le-error">{error}</div>}
    </div>
  );
}
