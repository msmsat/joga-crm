// Окно «Изменить занятие» — тело попапа журнала в режиме правки. Слева «что и
// когда» (услуга, день, время), справа «кто, где и сколько» (тренер, зал,
// места). Каждое изменённое поле помечено. Кнопки и строка о том, кого
// уведомит перенос (EditorConsequence), — в подвале попапа.
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import { Select, type SelectOption } from '../../../../../components/ui/index';
import { useRoleLabel } from '../../../../../hooks/useBusinessTerms';
import type { Booking, Hall, Trainer } from '../../types';
import { MAX_TIME_INDEX } from '../../utils';
import type { DraftField, LessonDraft } from './editor/editorModel';
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
  serviceOptions: SelectOption[];
  onServiceChange: (value: string) => void;
}

export function LessonEditor({
  booking, draft, setDraft, state, trainers, halls, showHalls, timeStep, serviceOptions, onServiceChange,
}: Props) {
  const { t } = useTranslation('journal');
  const roleLabel = useRoleLabel();
  const changed = (field: DraftField) => state.changes.includes(field);
  const patch = (next: Partial<LessonDraft>) => setDraft(d => ({ ...d, ...next }));
  const hall = halls.find(h => h.name === draft.hall);

  return (
    <fieldset className="le" disabled={state.locked}>
      {state.locked && (
        <div className="le-notice">
          <Icons.LockIcon />
          <span>{t('bookingPopup.editor.locked')}</span>
        </div>
      )}

      <div className="le-col">
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

        {draft.date && (
          <Field label={t('bookingPopup.editor.day')} changed={changed('date')}>
            <WeekStrip
              value={draft.date}
              original={booking.date}
              latestStart={MAX_TIME_INDEX - (draft.timeEnd - draft.timeStart)}
              onChange={date => patch({ date })}
            />
          </Field>
        )}

        <Field label={t('bookingPopup.editor.time')} changed={changed('time')} error={state.errors.time}>
          <TimeControls
            timeStart={draft.timeStart}
            timeEnd={draft.timeEnd}
            stepMin={timeStep}
            earliest={state.earliest}
            invalid={!!state.errors.time}
            onChange={patch}
          />
        </Field>
      </div>

      <div className="le-col">
        {trainers.length > 0 && (
          <Field label={roleLabel('trainer')} changed={changed('trainer')}>
            <TrainerStrip trainers={trainers} value={draft.trainer} onChange={trainer => patch({ trainer })} />
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

        <MatsCapacity
          value={draft.maxClients}
          original={booking.maxClients}
          booked={booking.clients}
          hallCapacity={showHalls ? hall?.capacity : null}
          error={state.errors.capacity}
          changed={changed('capacity')}
          onChange={maxClients => patch({ maxClients })}
        />
      </div>
    </fieldset>
  );
}

/** Перенос дня, времени или места уйдёт записанным уведомлением — говорим это
 *  над «Сохранить», где решение и принимают. */
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
