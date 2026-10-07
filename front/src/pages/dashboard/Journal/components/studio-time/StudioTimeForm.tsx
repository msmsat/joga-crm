// Форма «Времени студии» (владелец): название, «Когда» с предупреждением о
// нерабочем времени, заметка со снимками и кого касается. Состояние живёт в
// окне (StudioTimeModal) — оно же рисует превью слева и подвал.
import { useTranslation } from 'react-i18next';
import { Input, NotePhotos, NoteDropZone } from '../../../../../components/ui/index';
import type { StudioTimeOutside } from '../../../../../api/schedule';
import type { Trainer } from '../../types';
import { PRESET_ICONS, STUDIO_TIME_ICON, studioTimePreset } from '../../studioTimeIcons';
import { LABEL_PRESETS, MAX_LABEL, MAX_NOTES, cleanLabel, type LabelPreset, type StudioTimeDraft } from '../../studioTimeModel';
import { OffHoursNote } from './OffHoursNote';
import { WhenCard } from './WhenCard';
import { WhoPicker } from './WhoPicker';

export interface FormPhotos {
  photos: string[];
  pending: string[];
  add: (files: FileList | File[] | null) => void;
  remove: (url: string) => void;
}

export function StudioTimeForm({
  draft, anchor, trainers, timeStep, outside, photos, saving, nameError, autoFocus, duration, onChange, onLabelTyped,
}: {
  draft: StudioTimeDraft;
  /** Окно открылось с этим днём и этим сотрудником — опоры ленты и «Все». */
  anchor: { date: string; staffId: number };
  trainers: Trainer[];
  timeStep: number;
  outside: StudioTimeOutside[];
  /** Снимки — добавлять можно, пока не набрался предел. */
  photos: FormPhotos & { canAdd: boolean };
  saving: boolean;
  nameError?: string;
  autoFocus: boolean;
  duration: (minutes: number) => string;
  onChange: (patch: Partial<StudioTimeDraft>) => void;
  onLabelTyped: () => void;
}) {
  const { t } = useTranslation('journal');
  const preset = (key: LabelPreset) => t(`studioTime.presets.${key}`);
  const named = studioTimePreset(draft.label, preset);
  const NameIcon = named ? PRESET_ICONS[named] : STUDIO_TIME_ICON;

  return (
    <fieldset className="st-form" disabled={saving}>
      <div className="st-field">
        <Input
          label={t('studioTime.name')}
          value={draft.label}
          // Ошибка — только когда название набрали и стёрли. На уходе фокуса
          // её подпись сдвигала чипы под пальцем, и нажатие на готовое
          // название промахивалось.
          onChange={label => { onLabelTyped(); onChange({ label: label.slice(0, MAX_LABEL) }); }}
          placeholder={t('studioTime.namePlaceholder')}
          icon={<NameIcon size={16} strokeWidth={1.8} />}
          error={nameError}
          autoFocus={autoFocus}
        />
        <div className="st-chips" role="list">
          {LABEL_PRESETS.map(key => {
            const Icon = PRESET_ICONS[key];
            const text = preset(key);
            return (
              <button key={key} type="button" role="listitem"
                      className={`st-chip${cleanLabel(draft.label) === text ? ' is-on' : ''}`}
                      onClick={() => onChange({ label: text })}>
                <Icon size={13} strokeWidth={2} aria-hidden />{text}
              </button>
            );
          })}
        </div>
      </div>

      <WhenCard draft={draft} anchor={anchor.date} timeStep={timeStep} duration={duration} onChange={onChange}
                footer={<OffHoursNote outside={outside} trainers={trainers} />} />

      <div className="st-field st-note">
        <NoteDropZone onFiles={photos.add}>
          <Input label={t('studioTime.note')} rows={3} value={draft.notes}
                 placeholder={t('studioTime.notePlaceholder')}
                 onChange={notes => onChange({ notes: notes.slice(0, MAX_NOTES) })} />
        </NoteDropZone>
        <NotePhotos photos={photos.photos} pending={photos.pending} onRemove={photos.remove}
                    onAdd={photos.canAdd ? photos.add : undefined} />
      </div>

      <WhoPicker trainers={trainers} value={draft.staffIds} anchor={anchor.staffId} outside={outside}
                 onChange={staffIds => onChange({ staffIds })} />
    </fieldset>
  );
}
