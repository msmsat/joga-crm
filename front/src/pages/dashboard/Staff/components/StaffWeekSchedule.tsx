import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../../../../api/queryKeys';
import { staffApi } from '../../../../api/staff';
import { ApiError } from '../../../../api/client';
import type { StaffEditorDay } from '../../../../api/staff/staff.types';
import { Button, Input, ModalBody, ModalFooter, ModalHeader, ModalShell, GhostButton, PrimaryButton, Switch, useToast } from '../../../../components/ui/index';
import { DAYS_KEYS } from '../constants';
import { minuteOf, shiftParts, timeOf, validShift } from '../scheduleModel';
import './StaffWeekSchedule.css';

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDay = (s: string) => new Date(`${s}T12:00:00`);
function mondayOf(today: string) { const d = parseDay(today); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dateKey(d); }

export function StaffWeekSchedule({ staffId, today, onSaved }: { staffId: number; today: string; onSaved: () => void }) {
  const { t, i18n } = useTranslation(['staff', 'common']);
  const toast = useToast();
  const [week, setWeek] = useState(() => mondayOf(today));
  const [draft, setDraft] = useState<StaffEditorDay | null>(null);
  const [repeat, setRepeat] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const query = useQuery({ queryKey: queryKeys.staffScheduleEditor(staffId, week), queryFn: () => staffApi.getScheduleEditor(staffId, week) });
  const move = (n: number) => { const d = parseDay(week); d.setDate(d.getDate() + n * 7); setWeek(dateKey(d)); };
  const format = (s: string) => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(parseDay(s));
  const sunday = parseDay(week); sunday.setDate(sunday.getDate() + 6);
  const openDay = (day: StaffEditorDay) => { setDraft({ ...day, breaks: (day.breaks ?? []).map(b => ({ ...b })) }); setRepeat(false); setError(''); };
  const patch = (value: Partial<StaffEditorDay>) => { setDraft(d => d ? { ...d, ...value } : d); setError(''); };
  const save = async () => {
    if (!draft || !validShift(draft)) { setError(t('staff:schedule.invalidBreaks')); return; }
    setSaving(true); setError('');
    try {
      const { day_of_week, is_open, open_time, close_time, breaks, off_label } = draft;
      await staffApi.saveScheduleEditor(staffId, { week_start: week, repeat_weekly: repeat,
        days: [{ day_of_week, is_open, open_time, close_time, breaks: is_open ? breaks : [], off_label }] });
      onSaved(); setDraft(null); toast.success(t('staff:toasts.changesSaved'));
    } catch (e) { setError(e instanceof ApiError ? e.message : t('staff:toasts.errorSave')); }
    finally { setSaving(false); }
  };
  return <div className="staff-week">
    <div className="staff-week-nav">
      <Button variant="ghost" size="sm" ariaLabel={t('staff:schedule.prevWeek')} onClick={() => move(-1)}>‹</Button>
      <span>{format(week)} — {format(dateKey(sunday))}</span>
      <Button variant="ghost" size="sm" ariaLabel={t('staff:schedule.nextWeek')} onClick={() => move(1)}>›</Button>
    </div>
    <p className="staff-week-hint">{t('staff:schedule.editHint')}</p>
    {query.isPending && <p>{t('common:loading')}</p>}
    {query.isError && <div role="alert"><p>{t('staff:toasts.errorSave')}</p><Button variant="ghost" onClick={() => query.refetch()}>{t('common:errors.retry')}</Button></div>}
    {query.data?.days.map(day => {
      const parts = shiftParts(day);
      const summary = day.is_open ? parts.map(([a, b]) => `${timeOf(a)}–${timeOf(b)}`).join(' · ') : day.off_label || t('staff:schedule.dayOff');
      return <button type="button" className={`staff-week-day ${!day.is_open ? 'is-off' : ''}`} key={day.date} onClick={() => openDay(day)}>
        <span className="staff-week-date"><b>{t(`common:days.short.${DAYS_KEYS[day.day_of_week]}`)}</b><small>{format(day.date)}</small></span>
        <span className="staff-week-detail"><strong>{summary}</strong>
          {day.is_open && !!day.breaks?.length && <small>{day.breaks.map(b => `${b.open_time}–${b.close_time} ${b.label || t('staff:schedule.break')}`).join(' · ')}</small>}
          <span className="staff-week-track" aria-hidden>{parts.flatMap(([a, b]) => {
            const pieces = a >= 1440 ? [[a - 1440, b - 1440]]
              : b > 1440 ? [[a, 1440], [0, b - 1440]] : [[a, b]];
            return pieces.map(([start, end], i) => <i key={`${a}-${i}`} style={{ left: `${start / 1440 * 100}%`, width: `${(end - start) / 1440 * 100}%` }} />);
          })}</span>
        </span><span className="staff-week-edit" aria-hidden>✎</span>
      </button>;
    })}
    {draft && <ModalShell onClose={() => { if (!saving) setDraft(null); }} dismissible={!saving}>
      <ModalHeader title={t('staff:schedule.editorTitle')} subtitle={`${t(`common:days.short.${DAYS_KEYS[draft.day_of_week]}`)} · ${format(draft.date)}`} />
      <ModalBody>
        <div className="staff-week-scope" role="group" aria-label={t('staff:schedule.scope')}>
          <Button variant={repeat ? 'ghost' : 'primary'} size="sm" onClick={() => { setRepeat(false); setError(''); }}>{t('staff:schedule.scopeWeek')}</Button>
          <Button variant={repeat ? 'primary' : 'ghost'} size="sm" onClick={() => { setRepeat(true); setError(''); }}>{t('staff:schedule.scopeWeekly')}</Button>
        </div>
        <p className="staff-week-hint">{t(repeat ? 'staff:schedule.repeatHint' : 'staff:schedule.onceHint')}</p>
        <div className="staff-week-toggle"><strong>{t(draft.is_open ? 'staff:schedule.markWork' : 'staff:schedule.dayOff')}</strong><Switch checked={draft.is_open} onChange={is_open => patch({ is_open })} /></div>
        {draft.is_open ? <>
          <div className="staff-week-time-fields"><Input type="time" label={t('staff:availability.from')} value={draft.open_time} onChange={open_time => patch({ open_time })} /><Input type="time" label={t('staff:availability.to')} value={draft.close_time} onChange={close_time => patch({ close_time })} /></div>
          {(draft.breaks ?? []).map((b, i) => <div className="staff-week-break" key={i}>
            <div className="staff-week-break-head"><b>{t('staff:schedule.break')} {i + 1}</b><Button variant="ghost" size="sm" ariaLabel={t('staff:schedule.removeBreak')} onClick={() => patch({ breaks: draft.breaks?.filter((_, n) => n !== i) })}>×</Button></div>
            <div className="staff-week-time-fields"><Input type="time" label={t('staff:availability.from')} value={b.open_time} onChange={v => patch({ breaks: draft.breaks?.map((x, n) => n === i ? { ...x, open_time: v } : x) })} /><Input type="time" label={t('staff:availability.to')} value={b.close_time} onChange={v => patch({ breaks: draft.breaks?.map((x, n) => n === i ? { ...x, close_time: v } : x) })} /></div>
            <Input label={t('staff:schedule.label')} placeholder={t('staff:availability.reasonPlaceholder')} value={b.label ?? ''} onChange={v => patch({ breaks: draft.breaks?.map((x, n) => n === i ? { ...x, label: v.slice(0, 200) } : x) })} />
          </div>)}
          <Button variant="ghost" size="sm" onClick={() => {
            const start = minuteOf(draft.open_time), end = minuteOf(draft.close_time) + (draft.close_time <= draft.open_time ? 1440 : 0);
            const a = Math.min(start + 240, end - 60);
            patch({ breaks: [...(draft.breaks ?? []), { open_time: timeOf(a), close_time: timeOf(a + 60), label: '' }] });
          }}>+ {t('staff:schedule.addBreak')}</Button>
        </> : <Input label={t('staff:schedule.label')} placeholder={t('staff:schedule.dayOff')} value={draft.off_label ?? ''} onChange={v => patch({ off_label: v.slice(0, 200) })} />}
        {!repeat && draft.date < today && <p className="staff-week-error" role="alert">{t('staff:schedule.pastDayLocked')}</p>}
        {error && <p className="staff-week-error" role="alert">{error}</p>}
      </ModalBody>
      <ModalFooter><GhostButton onClick={() => { if (!saving) setDraft(null); }}>{t('common:buttons.cancel')}</GhostButton><PrimaryButton onClick={save} loading={saving} disabled={!repeat && draft.date < today}>{t('common:buttons.save')}</PrimaryButton></ModalFooter>
    </ModalShell>}
  </div>;
}
