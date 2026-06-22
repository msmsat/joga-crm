import { useState } from 'react'

interface Props { onClose(): void }

export function StudioMockup({ onClose }: Props) {
  const [activeService, setActiveService] = useState<number | null>(null)
  const [step, setStep] = useState<'services' | 'slots' | 'confirm'>('services')
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)

  const services = [
    { id: 1, name: 'Групповой пилатес',      price: '₽1 200', dur: '60 мин', color: '#FCAE91', spots: 3 },
    { id: 2, name: 'Индивидуальное занятие', price: '₽2 500', dur: '50 мин', color: '#5BAB72', spots: 1 },
    { id: 3, name: 'Стретчинг',              price: '₽900',   dur: '45 мин', color: '#4A80C4', spots: 5 },
    { id: 4, name: 'Реформер',               price: '₽3 200', dur: '55 мин', color: '#B07A8A', spots: 2 },
  ]

  const slots = ['10:00', '11:30', '13:00', '15:00', '17:30', '19:00']
  const selectedSvc = services.find(s => s.id === activeService)

  return (
    <div className="mockup-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mockup-wrapper">
        <div className="phone-frame">
          <div className="phone-notch"></div>
          <div className="phone-screen">
            <div className="ms-header">
              <div className="ms-logo-area">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M14 26 C14 26 3 18 3 10 C3 5 8 2 14 2 C20 2 25 5 25 10 C25 18 14 26 14 26Z" stroke="#FCAE91" strokeWidth="1.5" fill="none"/>
                  <circle cx="14" cy="10" r="3" fill="#FCAE91" fillOpacity="0.6"/>
                </svg>
                <div>
                  <div className="ms-logo-name">Pilates Studio</div>
                  <div className="ms-logo-sub">· г. Москва, Чистые пруды</div>
                </div>
              </div>
              {step !== 'services' && (
                <button className="ms-back" onClick={() => setStep(step === 'confirm' ? 'slots' : 'services')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
              )}
            </div>

            <div className="ms-steps">
              {['Услуга', 'Время', 'Запись'].map((s, i) => {
                const stepIdx = step === 'services' ? 0 : step === 'slots' ? 1 : 2
                return (
                  <div key={i} className={`ms-step ${i <= stepIdx ? 'active' : ''}`}>
                    <div className="ms-step-dot"></div>
                    <span>{s}</span>
                  </div>
                )
              })}
            </div>

            <div className="ms-content">
              {step === 'services' && (
                <>
                  <div className="ms-section-label">Выберите направление</div>
                  {services.map(svc => (
                    <div
                      key={svc.id}
                      className={`ms-service-card ${activeService === svc.id ? 'selected' : ''}`}
                      onClick={() => setActiveService(svc.id)}
                    >
                      <div className="ms-svc-dot" style={{ background: svc.color }}></div>
                      <div className="ms-svc-info">
                        <div className="ms-svc-name">{svc.name}</div>
                        <div className="ms-svc-meta">{svc.dur} · {svc.spots} мест</div>
                      </div>
                      <div className="ms-svc-price">{svc.price}</div>
                    </div>
                  ))}
                  <button className="ms-cta" disabled={!activeService} onClick={() => activeService && setStep('slots')}>
                    Выбрать время →
                  </button>
                </>
              )}

              {step === 'slots' && selectedSvc && (
                <>
                  <div className="ms-chosen-svc">
                    <div className="ms-svc-dot" style={{ background: selectedSvc.color }}></div>
                    <span>{selectedSvc.name}</span>
                    <span className="ms-svc-price">{selectedSvc.price}</span>
                  </div>
                  <div className="ms-section-label">Доступное время · Сегодня</div>
                  <div className="ms-slots-grid">
                    {slots.map(slot => (
                      <div
                        key={slot}
                        className={`ms-slot ${selectedSlot === slot ? 'selected' : ''}`}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {slot}
                      </div>
                    ))}
                  </div>
                  <button className="ms-cta" disabled={!selectedSlot} onClick={() => selectedSlot && setStep('confirm')}>
                    Подтвердить {selectedSlot} →
                  </button>
                </>
              )}

              {step === 'confirm' && selectedSvc && (
                <>
                  <div className="ms-confirm-icon">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="14" stroke="#5BAB72" strokeWidth="1.5"/>
                      <path d="M10 16 L14 20 L22 12" stroke="#5BAB72" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="ms-confirm-title">Всё готово!</div>
                  <div className="ms-confirm-sub">Запись подтверждена</div>
                  <div className="ms-confirm-card">
                    <div className="ms-conf-row">
                      <span className="ms-conf-label">Услуга</span>
                      <span className="ms-conf-val">{selectedSvc.name}</span>
                    </div>
                    <div className="ms-conf-row">
                      <span className="ms-conf-label">Время</span>
                      <span className="ms-conf-val">Сегодня, {selectedSlot}</span>
                    </div>
                    <div className="ms-conf-row">
                      <span className="ms-conf-label">Стоимость</span>
                      <span className="ms-conf-val" style={{ color: '#FCAE91', fontWeight: 700 }}>{selectedSvc.price}</span>
                    </div>
                  </div>
                  <button className="ms-cta" onClick={() => { setStep('services'); setActiveService(null); setSelectedSlot(null) }}>
                    Записаться ещё раз
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mockup-info">
          <div className="mockup-info-badge">Превью виджета</div>
          <h3 className="mockup-info-title">Так видит запись ваш клиент</h3>
          <p className="mockup-info-sub">Интерактивный превью страницы онлайн-записи. Именно так она выглядит в браузере, Telegram-боте или на сайте.</p>
          <div className="mockup-feature-list">
            {[
              ['Выбор услуги',  'Клиент видит все направления, цены и количество мест'],
              ['Выбор времени', 'Слоты обновляются в реальном времени из расписания'],
              ['Подтверждение', 'Автоматическое уведомление клиенту и тренеру'],
            ].map(([title, desc], i) => (
              <div key={i} className="mockup-feature">
                <div className="mockup-feature-num">{i + 1}</div>
                <div>
                  <div className="mockup-feature-title">{title}</div>
                  <div className="mockup-feature-desc">{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="mockup-close-btn" onClick={onClose}>Закрыть превью</button>
        </div>
      </div>
    </div>
  )
}
