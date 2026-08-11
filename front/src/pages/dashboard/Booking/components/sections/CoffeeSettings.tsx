import { useState } from 'react'
import { Button } from '../../../../../components/ui/index'
import type { useBookingSettings } from '../../hooks/useBookingSettings'
import type { CoffeeSpot } from '../../../../../api/booking/booking.types'

type Props = ReturnType<typeof useBookingSettings>

/** Больше трёх мест владелец осмысленно не выберет — тот же предел, что на бэке. */
const MAX_SPOTS = 3

/**
 * «Кофе после занятия» — социальная механика мини-приложения.
 *
 * Клиентка, записавшаяся на занятие, получает предложение остаться на 15 минут
 * с группой. Согласились двое и больше — после занятия им придёт напоминание с
 * именами и местами из этого списка.
 *
 * Места вводятся руками, а не тянутся из карт: кураторский выбор владельца
 * («наше место», можно договориться о скидке) полезнее автоматической выдачи.
 */
export function CoffeeSettings(s: Props) {
  const { settings, patch, t } = s

  // Черновик редактирования. Сервер хранит только места с названием (пустые
  // отбрасывает CoffeeSpotInput), поэтому свежедобавленная пустая строка живёт
  // здесь: сохраняли бы её сразу — она исчезала бы из-под рук после рефетча.
  const [rows, setRows] = useState<CoffeeSpot[]>(settings?.coffee_spots ?? [])

  if (!settings) return null

  const commit = (next: CoffeeSpot[]) => {
    setRows(next)
    patch('coffee_spots', next.filter(spot => spot.name.trim()))
  }

  const edit = (index: number, field: keyof CoffeeSpot, value: string) =>
    commit(rows.map((spot, i) => (i === index ? { ...spot, [field]: value } : spot)))

  return (
    <div className="card">
      <div className="settings-row">
        <div>
          <div className="label">{t('sections.coffee.enabled.label')}</div>
          <div className="sub">{t('sections.coffee.enabled.sub')}</div>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={settings.coffee_enabled}
            onChange={e => patch('coffee_enabled', e.target.checked)}
          />
          <span className="toggle-slider"></span>
        </label>
      </div>

      {/* Места нужны только включённой механике: выключенной студии этот блок
          не о чем спрашивать. */}
      {settings.coffee_enabled && (
        <div style={{ marginTop: '24px' }}>
          <div className="label">{t('sections.coffee.spots.label')}</div>
          <div className="sub" style={{ marginBottom: '14px' }}>
            {t('sections.coffee.spots.sub')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rows.map((spot, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  className="input-field"
                  value={spot.name}
                  placeholder={t('sections.coffee.spots.namePlaceholder')}
                  onChange={e => edit(i, 'name', e.target.value)}
                  style={{ flex: '1 1 28%', minWidth: 0 }}
                />
                <input
                  className="input-field"
                  value={spot.address}
                  placeholder={t('sections.coffee.spots.addressPlaceholder')}
                  onChange={e => edit(i, 'address', e.target.value)}
                  style={{ flex: '1 1 38%', minWidth: 0 }}
                />
                <input
                  className="input-field"
                  value={spot.url ?? ''}
                  placeholder={t('sections.coffee.spots.urlPlaceholder')}
                  onChange={e => edit(i, 'url', e.target.value)}
                  style={{ flex: '1 1 34%', minWidth: 0 }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => commit(rows.filter((_, index) => index !== i))}
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  }
                >
                  {''}
                </Button>
              </div>
            ))}
          </div>

          {rows.length < MAX_SPOTS && (
            <Button
              variant="ghost"
              size="sm"
              style={{ marginTop: '12px' }}
              onClick={() => setRows([...rows, { name: '', address: '', url: null }])}
            >
              {t('sections.coffee.spots.add')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
