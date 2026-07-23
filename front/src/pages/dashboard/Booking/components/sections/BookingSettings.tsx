import { useRef, useState } from 'react'
import { CustomSelect } from '../ui/CustomSelect'
import type { useBookingSettings } from '../../hooks/useBookingSettings'
import { ADVANCE_OPTS, WINDOW_OPTS, CANCEL_OPTS, LANG_OPTS, STEP_OPTS, TIME_OPTS } from '../../mapping'
import { studioApi } from '../../../../../api/studio/studio.api'
import { useToast } from '../../../../../components/ui/Toast'

type Props = ReturnType<typeof useBookingSettings>

export function BookingSettings(s: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const toast = useToast()
  const { settings, patch, t } = s

  if (!settings) return <div className="card" style={{ opacity: 0.6 }}>{t('loading')}</div>

  const advanceOpts = ADVANCE_OPTS.map(o => ({ value: o.value, label: t(`options.${o.key}`) }))
  const windowOpts  = WINDOW_OPTS.map(o => ({ value: o.value, label: t(`options.${o.key}`) }))
  const cancelOpts  = CANCEL_OPTS.map(o => ({ value: o.value, label: t(`options.${o.key}`) }))
  const langOpts    = LANG_OPTS.map(o => ({ value: o.value, label: t(`options.${o.key}`) }))
  const stepOpts    = STEP_OPTS.map(o => ({ value: o.value, label: t(`options.${o.key}`) }))
  const timeOpts    = TIME_OPTS.map(v => ({ value: v, label: v }))

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const { url } = await studioApi.uploadLogo(file)
      patch('widget_logo_url', url)
    } catch {
      toast.error(t('sections.branding.logo.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid-2" style={{ gap: '24px' }}>

      {/* Основные настройки */}
      <div className="card">
        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <svg width="100%" height="60" viewBox="0 0 380 60" fill="none" style={{ display: 'block' }}>
            <line x1="0" y1="30" x2="380" y2="30" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4"/>
            {[
              { x: 20,  w: 60, c: 'rgba(252,174,145,0.5)' },
              { x: 100, w: 45, c: 'rgba(91,171,114,0.4)' },
              { x: 165, w: 75, c: 'rgba(74,128,196,0.4)' },
              { x: 260, w: 50, c: 'rgba(252,174,145,0.3)' },
              { x: 325, w: 40, c: 'rgba(91,171,114,0.35)' },
            ].map((slot, i) => (
              <g key={i}>
                <rect x={slot.x} y="18" width={slot.w} height="24" rx="6" fill={slot.c}/>
                <circle cx={slot.x + slot.w / 2} cy="30" r="3" fill="var(--accent)" fillOpacity="0.6"/>
              </g>
            ))}
            {['09:00', '11:00', '13:00', '15:00', '17:00'].map((t, i) => (
              <text key={i} x={20 + i * 85} y="55" fontSize="8" fill="var(--text3)" textAnchor="middle">{t}</text>
            ))}
          </svg>
        </div>

        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>{t('sections.main.title')}</div>

        <div className="settings-row">
          <div>
            <div className="label">{t('sections.main.prefill.label')}</div>
            <div className="sub">{t('sections.main.prefill.sub')}</div>
          </div>
          <label className="toggle-switch"><input type="checkbox" checked={settings.prefill_on_booking} onChange={e => patch('prefill_on_booking', e.target.checked)} /><span className="toggle-slider"></span></label>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">{t('sections.main.trainerConfirm.label')}</div>
            <div className="sub">{t('sections.main.trainerConfirm.sub')}</div>
          </div>
          <label className="toggle-switch"><input type="checkbox" checked={settings.trainer_confirmation_required} onChange={e => patch('trainer_confirmation_required', e.target.checked)} /><span className="toggle-slider"></span></label>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">{t('sections.main.clientReminder.label')}</div>
            <div className="sub">{t('sections.main.clientReminder.sub')}</div>
          </div>
          <label className="toggle-switch"><input type="checkbox" checked={settings.client_reminder_enabled} onChange={e => patch('client_reminder_enabled', e.target.checked)} /><span className="toggle-slider"></span></label>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">{t('sections.main.bookingActive.label')}</div>
            <div className="sub">{t('sections.main.bookingActive.sub')}</div>
          </div>
          <label className="toggle-switch"><input type="checkbox" checked={settings.booking_active} onChange={e => patch('booking_active', e.target.checked)} /><span className="toggle-slider"></span></label>
        </div>
      </div>

      {/* Ограничения и правила */}
      <div className="card">
        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <svg width="100%" height="60" viewBox="0 0 380 60" fill="none" style={{ display: 'block' }}>
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <rect key={i} x={10 + i * 52} y={10} width={40} height={40} rx="6" fill="var(--bg2)" fillOpacity="0.5"/>
            ))}
            {[
              { h: 30, y: 20, c: 'rgba(252,174,145,0.6)' },
              { h: 22, y: 28, c: 'rgba(252,174,145,0.4)' },
              { h: 38, y: 12, c: 'rgba(252,174,145,0.7)' },
              { h: 18, y: 32, c: 'rgba(252,174,145,0.35)' },
              { h: 28, y: 22, c: 'rgba(252,174,145,0.5)' },
              { h: 35, y: 15, c: 'rgba(252,174,145,0.65)' },
              { h: 25, y: 25, c: 'rgba(252,174,145,0.45)' },
            ].map((bar, i) => (
              <rect key={i} x={10 + i * 52} y={bar.y} width={40} height={bar.h} rx="6" fill={bar.c}/>
            ))}
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d, i) => (
              <text key={i} x={30 + i * 52} y="57" fontSize="8" fill="var(--text3)" textAnchor="middle">{d}</text>
            ))}
          </svg>
        </div>

        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>{t('sections.rules.title')}</div>

        <div className="settings-row" style={{ position: 'relative' }}>
          <div>
            <div className="label">{t('sections.rules.advance.label')}</div>
            <div className="sub">{t('sections.rules.advance.sub')}</div>
          </div>
          <CustomSelect options={advanceOpts} value={s.advanceValue(settings.min_booking_advance_min)} onChange={v => patch('min_booking_advance_min', v)} />
        </div>

        <div className="settings-row" style={{ position: 'relative' }}>
          <div>
            <div className="label">{t('sections.rules.window.label')}</div>
            <div className="sub">{t('sections.rules.window.sub')}</div>
          </div>
          <CustomSelect options={windowOpts} value={s.windowValue(settings.booking_window_days)} onChange={v => patch('booking_window_days', v)} />
        </div>

        <div className="settings-row" style={{ position: 'relative' }}>
          <div>
            <div className="label">{t('sections.rules.cancel.label')}</div>
            <div className="sub">{t('sections.rules.cancel.sub')}</div>
          </div>
          <CustomSelect options={cancelOpts} value={s.cancelValue(settings.cancellation_deadline_min)} onChange={v => patch('cancellation_deadline_min', v)} />
        </div>

        <div className="settings-row">
          <div>
            <div className="label">{t('sections.rules.repeat.label')}</div>
            <div className="sub">{t('sections.rules.repeat.sub')}</div>
          </div>
          <label className="toggle-switch"><input type="checkbox" checked={settings.repeat_booking_allowed} onChange={e => patch('repeat_booking_allowed', e.target.checked)} /><span className="toggle-slider"></span></label>
        </div>

        <div className="settings-row" style={{ position: 'relative' }}>
          <div>
            <div className="label">{t('sections.rules.workHours.label')}</div>
            <div className="sub">{t('sections.rules.workHours.sub')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <CustomSelect options={timeOpts} value={settings.widget_work_start} onChange={v => patch('widget_work_start', v)} />
            <span style={{ color: 'var(--text3)' }}>—</span>
            <CustomSelect options={timeOpts} value={settings.widget_work_end} onChange={v => patch('widget_work_end', v)} />
          </div>
        </div>

        <div className="settings-row" style={{ position: 'relative' }}>
          <div>
            <div className="label">{t('sections.rules.step.label')}</div>
            <div className="sub">{t('sections.rules.step.sub')}</div>
          </div>
          <CustomSelect options={stepOpts} value={s.stepValue(settings.slot_step_min)} onChange={v => patch('slot_step_min', v)} />
        </div>
      </div>

      {/* Брендинг виджета */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>{t('sections.branding.title')}</div>
        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '20px' }}>{t('sections.branding.sub')}</div>

        <div className="brand-color-preview">
          <div className="bcp-label">{t('sections.branding.accentColor')}</div>
          <div className="bcp-swatches">
            {s.WIDGET_COLORS.map((c, i) => (
              <div key={i} className={`bcp-swatch${c === settings.widget_accent_color ? ' active' : ''}`} style={{ background: c }} onClick={() => patch('widget_accent_color', c)}></div>
            ))}
          </div>
        </div>

        <div className="settings-row" style={{ marginTop: '16px' }}>
          <div>
            <div className="label">{t('sections.branding.logo.label')}</div>
            <div className="sub">{t('sections.branding.logo.sub')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {settings.widget_logo_url && (
              <>
                <img
                  src={settings.widget_logo_url}
                  alt=""
                  style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border)' }}
                />
                <button className="settings-upload-btn" onClick={() => patch('widget_logo_url', null)}>
                  {t('sections.branding.logo.remove')}
                </button>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={onLogoChange}
            />
            <button className="settings-upload-btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              {uploading ? t('sections.branding.logo.uploading') : t('sections.branding.logo.upload')}
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">{t('sections.branding.darkMode.label')}</div>
            <div className="sub">{t('sections.branding.darkMode.sub')}</div>
          </div>
          <label className="toggle-switch"><input type="checkbox" checked={settings.widget_dark_mode} onChange={e => patch('widget_dark_mode', e.target.checked)} /><span className="toggle-slider"></span></label>
        </div>

        <div className="settings-row" style={{ position: 'relative' }}>
          <div>
            <div className="label">{t('sections.branding.language.label')}</div>
            <div className="sub">{t('sections.branding.language.sub')}</div>
          </div>
          <CustomSelect options={langOpts} value={s.langValue(settings.widget_language)} onChange={v => patch('widget_language', v)} />
        </div>
      </div>

      {/* Уведомления */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>{t('sections.notifications.title')}</div>
        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '20px' }}>{t('sections.notifications.sub')}</div>

        <div className="notif-illustration">
          <div className="notif-bubble notif-bubble-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ marginRight: '6px', flexShrink: 0 }}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6.06 6.06l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span>{t('sections.notifications.preview.confirmed')}</span>
          </div>
          <div className="notif-bubble notif-bubble-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4A80C4" strokeWidth="2" style={{ marginRight: '6px', flexShrink: 0 }}>
              <path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            <span>{t('sections.notifications.preview.reminder2h')}</span>
          </div>
          <div className="notif-bubble notif-bubble-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2" style={{ marginRight: '6px', flexShrink: 0 }}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l8.84 8.84 8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span>{t('sections.notifications.preview.reviewRequest')}</span>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">{t('sections.notifications.sms.label')}</div>
            <div className="sub">{t('sections.notifications.sms.sub')}</div>
          </div>
          <label className="toggle-switch"><input type="checkbox" checked={settings.sms_confirmation} onChange={e => patch('sms_confirmation', e.target.checked)} /><span className="toggle-slider"></span></label>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">{t('sections.notifications.reminder24h.label')}</div>
            <div className="sub">{t('sections.notifications.reminder24h.sub')}</div>
          </div>
          <label className="toggle-switch"><input type="checkbox" checked={settings.reminder_24h} onChange={e => patch('reminder_24h', e.target.checked)} /><span className="toggle-slider"></span></label>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">{t('sections.notifications.reminder2h.label')}</div>
            <div className="sub">{t('sections.notifications.reminder2h.sub')}</div>
          </div>
          <label className="toggle-switch"><input type="checkbox" checked={settings.reminder_2h} onChange={e => patch('reminder_2h', e.target.checked)} /><span className="toggle-slider"></span></label>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">{t('sections.notifications.reviewRequest.label')}</div>
            <div className="sub">{t('sections.notifications.reviewRequest.sub')}</div>
          </div>
          <label className="toggle-switch"><input type="checkbox" checked={settings.review_request} onChange={e => patch('review_request', e.target.checked)} /><span className="toggle-slider"></span></label>
        </div>
      </div>
    </div>
  )
}
