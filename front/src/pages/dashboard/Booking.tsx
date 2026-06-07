import { useState, useRef, useEffect } from 'react';

// ─── INSTAGRAM MODAL ───
function InstaModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tg-modal">
        {/* Шапка 1-в-1 как в Telegram */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(201,107,158,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C96B9E' }}>
              <IconInstagram />
            </div>
            <div className="modal-title" style={{ marginBottom: 0 }}>Instagram Bio</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="modal-sub" style={{ marginBottom: '16px' }}>
          Разместите ссылку для быстрой записи клиентов в профиле и историях
        </div>

        <div className="instruction-box">
          <div className="ins-step">
            <div className="ins-num">1</div>
            <div style={{ flex: 1 }}>
              <div className="ins-text"><strong>Скопируйте вашу ссылку</strong></div>
              <div className="link-copy-block" onClick={() => { navigator.clipboard.writeText('book.velora.studio/my-studio'); alert('Ссылка скопирована!'); }}>
                <span>book.velora.studio/my-studio</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
              </div>
            </div>
          </div>
          <div className="ins-step">
            <div className="ins-num">2</div>
            <div className="ins-text">Вставьте её в поле <strong>"Сайт"</strong> (Website) в настройках профиля Instagram.</div>
          </div>
          <div className="ins-step">
            <div className="ins-num">3</div>
            <div className="ins-text">Добавляйте ссылку в <strong>Stories</strong> через специальный стикер.</div>
          </div>
        </div>

        <div className="pro-tip">
          <span className="pro-badge">PRO TIP</span>
          Закрепите Story с процессом записи в Highlights — это повышает конверсию на 30%.
        </div>
      </div>
    </div>
  );
}

// ─── WEB WIDGET MODAL ───
function WebModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tg-modal">
        {/* Шапка 1-в-1 как в Telegram */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(91,171,114,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5BAB72' }}>
              <IconWeb />
            </div>
            <div className="modal-title" style={{ marginBottom: 0 }}>Виджет на сайт</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="modal-sub">Установите кнопку записи на любой сайт (Tilda, WordPress или кастомный код)</div>

        <div className="code-block">
          <div className="code-header">HTML / JavaScript</div>
          <pre>
{`<script src="https://velora.studio/widget.js"></script>
<script>
  Velora.init({ studioId: 'my-studio' });
</script>`}
          </pre>
          <button className="code-copy" onClick={() => alert('Код скопирован!')}>Копировать</button>
        </div>

        <div className="instruction-box" style={{ marginTop: '16px' }}>
          <div className="ins-step" style={{ marginBottom: 0 }}>
            <div className="ins-num" style={{ background: 'var(--accent)' }}>!</div>
            <div className="ins-text">Вставьте этот код перед закрывающим тегом <code>&lt;/body&gt;</code> на вашем сайте. Кнопка появится автоматически.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WHATSAPP MODAL ───
function WaModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tg-modal">
        {/* Шапка 1-в-1 как в Telegram */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(37,211,102,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#25D366' }}>
              <IconWhatsApp />
            </div>
            <div className="modal-title" style={{ marginBottom: 0 }}>WhatsApp запись</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="modal-sub" style={{ marginBottom: '16px' }}>
          Настройте автоответчик в WhatsApp Business для мгновенной отправки ссылки на запись.
        </div>

        <div className="wa-preview">
          <div className="wa-bubble">
            Здравствуйте! Хочу записаться в вашу студию. Подскажите свободное время?
            <span className="wa-time">10:42</span>
          </div>
          <div className="wa-bubble bot">
            Приветствуем! ✨ Вы можете выбрать время и записаться мгновенно по ссылке: <br/><br/>
            <span style={{ color: '#027EB5' }}>book.velora.studio/my-studio</span>
            <span className="wa-time">10:42</span>
          </div>
        </div>
        
        <button className="topbar-btn" style={{ width: '100%', justifyContent: 'center', marginTop: '16px', padding: '11px' }}>
          Подключить WhatsApp Business
        </button>
      </div>
    </div>
  );
}

function CustomSelect({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="cs-container">
      <div className={`cs-trigger ${isOpen ? 'active' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <span>{value}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="cs-arrow">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      {isOpen && (
        <div className="cs-dropdown">
          {options.map((opt) => (
            <div
              key={opt}
              className={`cs-option ${opt === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
            >
              <span>{opt}</span>
              {opt === value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="cs-check">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MOCKUP POPUP ──────────────────────────────────────────────────────────────
function StudioMockup({ onClose }: { onClose: () => void }) {
  const [activeService, setActiveService] = useState<number | null>(null);
  const [step, setStep] = useState<'services' | 'slots' | 'confirm'>('services');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const services = [
    { id: 1, name: 'Групповой пилатес', price: '₽1 200', dur: '60 мин', color: '#FCAE91', spots: 3 },
    { id: 2, name: 'Индивидуальное занятие', price: '₽2 500', dur: '50 мин', color: '#5BAB72', spots: 1 },
    { id: 3, name: 'Стретчинг', price: '₽900', dur: '45 мин', color: '#4A80C4', spots: 5 },
    { id: 4, name: 'Реформер', price: '₽3 200', dur: '55 мин', color: '#B07A8A', spots: 2 },
  ];

  const slots = ['10:00', '11:30', '13:00', '15:00', '17:30', '19:00'];
  const selectedSvc = services.find(s => s.id === activeService);

  return (
    <div className="mockup-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mockup-wrapper">
        {/* Phone frame */}
        <div className="phone-frame">
          <div className="phone-notch"></div>

          {/* App inside phone */}
          <div className="phone-screen">
            {/* Header */}
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

            {/* Step indicator */}
            <div className="ms-steps">
              {['Услуга', 'Время', 'Запись'].map((s, i) => {
                const stepIdx = step === 'services' ? 0 : step === 'slots' ? 1 : 2;
                return (
                  <div key={i} className={`ms-step ${i <= stepIdx ? 'active' : ''}`}>
                    <div className="ms-step-dot"></div>
                    <span>{s}</span>
                  </div>
                );
              })}
            </div>

            {/* Content */}
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
                  <button
                    className="ms-cta"
                    disabled={!activeService}
                    onClick={() => activeService && setStep('slots')}
                  >
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
                  <button
                    className="ms-cta"
                    disabled={!selectedSlot}
                    onClick={() => selectedSlot && setStep('confirm')}
                  >
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
                  <button className="ms-cta" onClick={() => { setStep('services'); setActiveService(null); setSelectedSlot(null); }}>
                    Записаться ещё раз
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Info panel next to phone */}
        <div className="mockup-info">
          <div className="mockup-info-badge">Превью виджета</div>
          <h3 className="mockup-info-title">Так видит запись ваш клиент</h3>
          <p className="mockup-info-sub">Интерактивный превью страницы онлайн-записи. Именно так она выглядит в браузере, Telegram-боте или на сайте.</p>
          <div className="mockup-feature-list">
            {[
              ['Выбор услуги', 'Клиент видит все направления, цены и количество мест'],
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
  );
}

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
const IconTelegram = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13"/>
    <path d="M22 2L15 22L11 13L2 9L22 2Z"/>
  </svg>
);

const IconInstagram = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5"/>
    <circle cx="12" cy="12" r="4"/>
    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
  </svg>
);

const IconWeb = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const IconWhatsApp = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
  </svg>
);

// ─── CHANNEL CARD ────────────────────────────────────────────────────────────
interface ChannelCardProps {
  icon: React.ReactNode;
  name: string;
  desc: string;
  status?: 'connected' | 'pending' | null;
  color: string;
  onClick: () => void;
}

function ChannelCard({ icon, name, desc, status, color, onClick }: ChannelCardProps) {
  return (
    <div className="channel-card" onClick={onClick} style={{ '--channel-color': color } as React.CSSProperties}>
      <div className="channel-icon-wrap" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div className="channel-name">{name}</div>
      <div className="channel-desc">{desc}</div>
      {status === 'connected' && (
        <div className="channel-status connected">
          <span className="channel-status-dot"></span>Подключён
        </div>
      )}
      {status === 'pending' && (
        <div className="channel-status pending">Настроить</div>
      )}
    </div>
  );
}

// ─── TG MODAL ─────────────────────────────────────────────────────────────────
function TgModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tg-modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(74,128,196,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A80C4' }}>
              <IconTelegram />
            </div>
            <div className="modal-title" style={{ marginBottom: 0 }}>Telegram-бот</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="modal-sub">Вставьте токен бота из @BotFather</div>
        <input className="input-field" type="text" placeholder="123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ" style={{ marginBottom: '16px' }} />
        <button className="topbar-btn" style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>Подключить бота</button>
        <div className="instruction-box" style={{ marginTop: '16px' }}>
          <div className="ins-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Как получить токен?
          </div>
          <ol>
            <li>Откройте Telegram → найдите <strong>@BotFather</strong></li>
            <li>Отправьте команду <code>/newbot</code></li>
            <li>Придумайте имя и username для бота</li>
            <li>Скопируйте токен и вставьте выше</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Booking() {
  const [isTgModalOpen, setTgModalOpen] = useState(false);
  const [isInstaModalOpen, setInstaModalOpen] = useState(false);
  const [isWebModalOpen, setWebModalOpen] = useState(false);
  const [isWaModalOpen, setWaModalOpen] = useState(false);
  const [isMockupOpen, setMockupOpen] = useState(false);
  const [limitTime, setLimitTime] = useState('2 часа');
  const [openDays, setOpenDays] = useState('7 дней');
  const [cancelTime, setCancelTime] = useState('4 часа');
  const [language, setLanguage] = useState('Русский');

  const copyLink = () => {
    navigator.clipboard?.writeText('https://book.velora.studio/your-studio');
    alert('Ссылка скопирована: https://book.velora.studio/your-studio');
  };

  return (
    <>
      {/* ─── ROW 2: КАНАЛЫ ─── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: 'var(--text2)' }}>Каналы подключения</div>
        <div className="channels-grid">
          <ChannelCard
            icon={<IconTelegram />}
            name="Telegram-бот"
            desc="Автоматическая запись через бота"
            status={null}
            color="#4A80C4"
            onClick={() => setTgModalOpen(true)}
          />
          <ChannelCard
            icon={<IconInstagram />}
            name="Instagram"
            desc="Ссылка для bio и сторис"
            status="connected"
            color="#C96B9E"
            onClick={() => setInstaModalOpen(true)} // Обновили
          />
          <ChannelCard
            icon={<IconWeb />}
            name="Веб-сайт"
            desc="Виджет или отдельная страница"
            status="connected"
            color="#5BAB72"
            onClick={() => setWebModalOpen(true)} // Обновили
          />
          <ChannelCard
            icon={<IconWhatsApp />}
            name="WhatsApp"
            desc="Запись через мессенджер"
            status="pending"
            color="#25D366"
            onClick={() => setWaModalOpen(true)} // Обновили
          />
        </div>
      </div>

      {/* ─── ROW 3: НАСТРОЙКИ ─── */}
      <div className="grid-2" style={{ gap: '24px' }}>

        {/* Основные настройки */}
        <div className="card">
          {/* Декоративная SVG иллюстрация */}
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <svg width="100%" height="60" viewBox="0 0 380 60" fill="none" style={{ display: 'block' }}>
              {/* Линия расписания */}
              <line x1="0" y1="30" x2="380" y2="30" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4"/>
              {/* Слоты занятий */}
              {[
                { x: 20, w: 60, c: 'rgba(252,174,145,0.5)' },
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
              {/* Временные метки */}
              {['09:00', '11:00', '13:00', '15:00', '17:00'].map((t, i) => (
                <text key={i} x={20 + i * 85} y="55" fontSize="8" fill="var(--text3)" textAnchor="middle">{t}</text>
              ))}
            </svg>
          </div>

          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Основные настройки</div>

          <div className="settings-row">
            <div>
              <div className="label">Предоплата при записи</div>
              <div className="sub">Требовать оплату до подтверждения</div>
            </div>
            <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
          </div>

          <div className="settings-row">
            <div>
              <div className="label">Подтверждение тренером</div>
              <div className="sub">Запись ожидает ручного одобрения</div>
            </div>
            <label className="toggle-switch"><input type="checkbox" /><span className="toggle-slider"></span></label>
          </div>

          <div className="settings-row">
            <div>
              <div className="label">Напоминание клиенту</div>
              <div className="sub">За 24 и 2 часа до занятия</div>
            </div>
            <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
          </div>

          <div className="settings-row">
            <div>
              <div className="label">Онлайн-запись активна</div>
              <div className="sub">Показывать виджет клиентам</div>
            </div>
            <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
          </div>
        </div>

        {/* Дополнительные настройки */}
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

          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Ограничения и правила</div>

          <div className="settings-row" style={{ position: 'relative' }}>
            <div>
              <div className="label">Запрет записи менее чем за</div>
              <div className="sub">Минимум времени до занятия</div>
            </div>
            <CustomSelect 
              options={['1 час', '2 часа', '4 часа', '12 часов', '24 часа']} 
              value={limitTime} 
              onChange={setLimitTime} 
            />
          </div>

          <div className="settings-row" style={{ position: 'relative' }}>
            <div>
              <div className="label">Запись открывается за</div>
              <div className="sub">Сколько дней вперёд</div>
            </div>
            <CustomSelect 
              options={['7 дней', '14 дней', '30 дней', '60 дней']} 
              value={openDays} 
              onChange={setOpenDays} 
            />
          </div>

          <div className="settings-row" style={{ position: 'relative' }}>
            <div>
              <div className="label">Отмена без штрафа за</div>
              <div className="sub">До занятия клиент может отменить</div>
            </div>
            <CustomSelect 
              options={['2 часа', '4 часа', '12 часов', '24 часа']} 
              value={cancelTime} 
              onChange={setCancelTime} 
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="label">Повторная запись</div>
              <div className="sub">Разрешить клиенту записаться дважды</div>
            </div>
            <label className="toggle-switch"><input type="checkbox" /><span className="toggle-slider"></span></label>
          </div>
        </div>

        {/* Брендинг виджета */}
        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Брендинг виджета</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '20px' }}>Внешний вид страницы записи</div>

          {/* Цветовой превью */}
          <div className="brand-color-preview">
            <div className="bcp-label">Акцентный цвет</div>
            <div className="bcp-swatches">
              {['#FCAE91', '#5BAB72', '#4A80C4', '#C96B9E', '#F4A261', '#2A9D8F'].map((c, i) => (
                <div
                  key={i}
                  className={`bcp-swatch ${i === 0 ? 'active' : ''}`}
                  style={{ background: c }}
                ></div>
              ))}
            </div>
          </div>

          <div className="settings-row" style={{ marginTop: '16px' }}>
            <div>
              <div className="label">Логотип студии</div>
              <div className="sub">Отображается в шапке виджета</div>
            </div>
            <button className="settings-upload-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Загрузить
            </button>
          </div>

          <div className="settings-row">
            <div>
              <div className="label">Тёмная тема</div>
              <div className="sub">Виджет в тёмном оформлении</div>
            </div>
            <label className="toggle-switch"><input type="checkbox" /><span className="toggle-slider"></span></label>
          </div>

          {/* НАШ ОБНОВЛЕННЫЙ ЯЗЫКОВОЙ СЕЛЕКТ */}
          <div className="settings-row" style={{ position: 'relative' }}>
            <div>
              <div className="label">Язык по умолчанию</div>
              <div className="sub">Основной язык интерфейса</div>
            </div>
            <CustomSelect
              options={['Русский', 'English', 'Deutsch']}
              value={language}
              onChange={setLanguage}
            />
          </div>
        </div>

        {/* Уведомления */}
        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Уведомления</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '20px' }}>Автоматические сообщения клиентам</div>

          {/* Уведомления-иллюстрация */}
          <div className="notif-illustration">
            <div className="notif-bubble notif-bubble-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ marginRight: '6px', flexShrink: 0 }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6.06 6.06l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span>Запись подтверждена! Пн 10:00</span>
            </div>
            <div className="notif-bubble notif-bubble-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4A80C4" strokeWidth="2" style={{ marginRight: '6px', flexShrink: 0 }}>
                <path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              <span>Напоминание: через 2 часа</span>
            </div>
            <div className="notif-bubble notif-bubble-3">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2" style={{ marginRight: '6px', flexShrink: 0 }}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l8.84 8.84 8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              <span>Спасибо за визит! Оцените урок</span>
            </div>
          </div>

          <div className="settings-row">
            <div>
              <div className="label">SMS-подтверждение</div>
              <div className="sub">При успешной записи</div>
            </div>
            <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
          </div>

          <div className="settings-row">
            <div>
              <div className="label">Напоминание за 24 ч</div>
              <div className="sub">Утром перед занятием</div>
            </div>
            <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
          </div>

          <div className="settings-row">
            <div>
              <div className="label">Напоминание за 2 ч</div>
              <div className="sub">Незадолго до занятия</div>
            </div>
            <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
          </div>

          <div className="settings-row">
            <div>
              <div className="label">Запрос отзыва</div>
              <div className="sub">После посещения через 1 час</div>
            </div>
            <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
          </div>
        </div>
      </div>

      {/* ─── MODALS ─── */}
      {isTgModalOpen && <TgModal onClose={() => setTgModalOpen(false)} />}
      {isInstaModalOpen && <InstaModal onClose={() => setInstaModalOpen(false)} />}
      {isWebModalOpen && <WebModal onClose={() => setWebModalOpen(false)} />}
      {isWaModalOpen && <WaModal onClose={() => setWaModalOpen(false)} />}
      {isMockupOpen && <StudioMockup onClose={() => setMockupOpen(false)} />}

      {/* ─── STYLES ─── */}
      <style>{`
        /* ── MOCKUP OVERLAY ── */
        .mockup-overlay {
          position: fixed; inset: 0; z-index: 300;
          background: rgba(10, 10, 18, 0.75);
          backdrop-filter: blur(12px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          animation: fadeIn 0.25s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .mockup-wrapper {
          display: flex; align-items: center; gap: 48px;
          animation: slideUp 0.35s cubic-bezier(0.34,1.1,0.64,1);
        }
        @keyframes slideUp { from { transform: translateY(30px) scale(0.97); opacity: 0; } to { transform: none; opacity: 1; } }

        .phone-frame {
          width: 280px; flex-shrink: 0;
          background: #0A0A12;
          border-radius: 38px;
          padding: 14px 8px 14px;
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 40px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06);
          position: relative;
        }

        .phone-notch {
          width: 80px; height: 6px;
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
          margin: 0 auto 10px;
        }

        .phone-screen {
          background: var(--bg);
          border-radius: 28px;
          overflow: hidden;
          min-height: 520px;
        }

        /* ── MOCKUP SCREEN CONTENT ── */
        .ms-header {
          background: linear-gradient(135deg, #1A2E44 0%, #2A4060 100%);
          padding: 16px 16px 14px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .ms-logo-area { display: flex; align-items: center; gap: 8px; }
        .ms-logo-name { font-size: 13px; font-weight: 700; color: white; line-height: 1.2; }
        .ms-logo-sub { font-size: 9px; color: rgba(188,200,212,0.5); }
        .ms-back {
          background: rgba(255,255,255,0.1); border: none; cursor: pointer;
          width: 28px; height: 28px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.7);
        }

        .ms-steps {
          display: flex; gap: 0;
          padding: 10px 16px 8px;
          background: var(--bg2);
          border-bottom: 1px solid var(--border);
        }
        .ms-step {
          display: flex; align-items: center; gap: 5px;
          font-size: 9px; color: var(--text3);
          flex: 1; justify-content: center;
          opacity: 0.4; transition: opacity 0.2s;
        }
        .ms-step.active { opacity: 1; color: var(--accent); }
        .ms-step-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: currentColor;
        }

        .ms-content { padding: 14px 14px 20px; }

        .ms-section-label {
          font-size: 9px; color: var(--text3); font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.8px;
          margin-bottom: 10px;
        }

        .ms-service-card {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--bg2);
          cursor: pointer; margin-bottom: 6px;
          transition: all 0.15s;
        }
        .ms-service-card.selected {
          border-color: var(--accent); background: rgba(252,174,145,0.08);
        }
        .ms-svc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .ms-svc-info { flex: 1; }
        .ms-svc-name { font-size: 11px; font-weight: 600; color: var(--text); }
        .ms-svc-meta { font-size: 9px; color: var(--text3); margin-top: 1px; }
        .ms-svc-price { font-size: 11px; font-weight: 700; color: var(--text); }

        .ms-chosen-svc {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 12px; border-radius: 8px;
          background: rgba(252,174,145,0.1); border: 1px solid rgba(252,174,145,0.3);
          margin-bottom: 14px; font-size: 11px; font-weight: 600; color: var(--text);
        }

        .ms-slots-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 7px; margin-bottom: 14px;
        }
        .ms-slot {
          padding: 9px 4px; text-align: center;
          border: 1px solid var(--border); border-radius: 8px;
          font-size: 11px; font-weight: 600; cursor: pointer;
          background: var(--bg2); color: var(--text2);
          transition: all 0.15s;
        }
        .ms-slot.selected {
          background: var(--accent); border-color: var(--accent);
          color: white;
        }

        .ms-cta {
          width: 100%; padding: 11px;
          background: var(--accent); border: none; border-radius: 8px;
          color: white; font-size: 11px; font-weight: 700;
          cursor: pointer; font-family: var(--font);
          transition: opacity 0.2s;
        }
        .ms-cta:disabled { opacity: 0.4; cursor: not-allowed; }

        .ms-confirm-icon {
          display: flex; justify-content: center; margin: 8px 0 12px;
        }
        .ms-confirm-title {
          font-size: 20px; font-weight: 800; text-align: center;
          color: var(--text); margin-bottom: 4px;
        }
        .ms-confirm-sub {
          font-size: 11px; color: var(--text2); text-align: center;
          margin-bottom: 16px;
        }
        .ms-confirm-card {
          background: var(--bg2); border-radius: 10px;
          padding: 12px; border: 1px solid var(--border); margin-bottom: 14px;
        }
        .ms-conf-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 5px 0; border-bottom: 1px solid var(--border);
        }
        .ms-conf-row:last-child { border-bottom: none; }
        .ms-conf-label { font-size: 9px; color: var(--text3); font-weight: 600; text-transform: uppercase; }
        .ms-conf-val { font-size: 11px; font-weight: 700; color: var(--text); }

        /* ── MOCKUP INFO PANEL ── */
        .mockup-info {
          max-width: 320px; color: white;
        }
        .mockup-info-badge {
          display: inline-block;
          background: rgba(252,174,145,0.15); border: 1px solid rgba(252,174,145,0.3);
          color: #FCAE91; font-size: 10px; font-weight: 700;
          padding: 4px 12px; border-radius: 20px;
          margin-bottom: 16px; letter-spacing: 0.5px; text-transform: uppercase;
        }
        .mockup-info-title {
          font-size: 28px; font-weight: 800; color: white;
          line-height: 1.2; margin-bottom: 12px;
          letter-spacing: -0.5px;
        }
        .mockup-info-sub {
          font-size: 13px; color: rgba(188,200,212,0.65);
          line-height: 1.7; margin-bottom: 28px; font-weight: 400;
        }

        .mockup-feature-list { display: flex; flex-direction: column; gap: 14px; margin-bottom: 28px; }
        .mockup-feature { display: flex; align-items: flex-start; gap: 14px; }
        .mockup-feature-num {
          width: 24px; height: 24px; border-radius: 50%;
          background: rgba(252,174,145,0.2); border: 1px solid rgba(252,174,145,0.4);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 800; color: #FCAE91; flex-shrink: 0;
        }
        .mockup-feature-title { font-size: 13px; font-weight: 700; color: white; margin-bottom: 2px; }
        .mockup-feature-desc { font-size: 11px; color: rgba(188,200,212,0.5); line-height: 1.5; }

        .mockup-close-btn {
          padding: 11px 24px;
          background: transparent; border: 1px solid rgba(255,255,255,0.15);
          color: rgba(255,255,255,0.6); font-size: 12px; font-weight: 600;
          border-radius: 8px; cursor: pointer; font-family: var(--font);
          letter-spacing: 0.5px; transition: all 0.2s;
        }
        .mockup-close-btn:hover { background: rgba(255,255,255,0.06); }

        /* ── BOOKING TOP ROW ── */
        .booking-top-row {
          display: grid; grid-template-columns: 260px 1fr;
          gap: 24px; margin-bottom: 28px;
        }

        /* ── PREVIEW CARD ── */
        .booking-preview-card {
          position: relative;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 20px; overflow: hidden;
          cursor: pointer; transition: all 0.25s;
        }
        .booking-preview-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.08); }
        .booking-preview-card:hover .bp-overlay { opacity: 1; }

        .bp-deco { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }

        .bp-mini-site {
          background: white;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid rgba(0,0,0,0.06);
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
          position: relative; z-index: 1;
        }
        .bp-mini-header {
          background: #1A2E44; padding: 8px 12px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .bp-mini-logo {
          display: flex; align-items: center; gap: 6px;
          font-size: 10px; font-weight: 700; color: white;
        }
        .bp-mini-nav { display: flex; gap: 12px; }
        .bp-mini-nav span { font-size: 8px; color: rgba(255,255,255,0.5); }
        .bp-mini-hero {
          padding: 12px; background: linear-gradient(135deg, #1A2E44, #2A4060);
        }
        .bp-mini-headline {
          font-size: 14px; font-weight: 800; color: white;
          line-height: 1.2; margin-bottom: 8px;
        }
        .bp-mini-btn {
          display: inline-block; padding: 5px 12px;
          background: #FCAE91; border-radius: 6px;
          font-size: 9px; font-weight: 700; color: white;
        }
        .bp-mini-services { padding: 10px 12px; }
        .bp-mini-svc {
          display: flex; align-items: center; gap: 7px;
          padding: 6px 0; border-bottom: 1px solid #F0EDE8;
        }
        .bp-mini-svc:last-child { border-bottom: none; }
        .bp-mini-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .bp-mini-svc-name { font-size: 9px; color: #1A2030; flex: 1; font-weight: 500; }
        .bp-mini-svc-price { font-size: 9px; font-weight: 700; color: #FCAE91; }

        .bp-overlay {
          position: absolute; inset: 0; z-index: 10;
          background: rgba(18,18,18,0.55);
          backdrop-filter: blur(2px);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 8px;
          opacity: 0; transition: opacity 0.2s;
          border-radius: inherit;
        }
        .bp-overlay-icon {
          width: 44px; height: 44px; border-radius: 50%;
          background: rgba(252,174,145,0.9);
          display: flex; align-items: center; justify-content: center;
        }
        .bp-overlay-text { font-size: 12px; font-weight: 700; color: white; }

        /* ── AI PANEL ── */
        .ai-panel {
          background: var(--bg2); border: 1px solid var(--border);
          border-radius: var(--radius); overflow: hidden;
          display: flex; flex-direction: column;
          height: 100%; min-height: 340px; max-height: 420px;
        }

        .ai-panel-header {
          padding: 14px 16px; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 12px;
          background: var(--bg);
        }
        .ai-panel-icon {
          width: 34px; height: 34px; border-radius: 10px;
          background: rgba(252,174,145,0.12);
          display: flex; align-items: center; justify-content: center;
          color: var(--accent); flex-shrink: 0;
        }
        .ai-online-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #5BAB72; margin-left: auto;
          box-shadow: 0 0 0 2px rgba(91,171,114,0.25);
        }

        .ai-messages {
          flex: 1; overflow-y: auto; padding: 14px 14px 0;
          display: flex; flex-direction: column; gap: 10px;
          scrollbar-width: none;
        }
        .ai-messages::-webkit-scrollbar { display: none; }

        .ai-msg { display: flex; align-items: flex-end; gap: 7px; }
        .ai-msg.user { flex-direction: row-reverse; }

        .ai-avatar {
          width: 24px; height: 24px; border-radius: 50%;
          background: var(--accent); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 2px;
        }

        .ai-bubble {
          max-width: 78%; padding: 9px 12px;
          border-radius: 14px; font-size: 12px; line-height: 1.6;
          color: var(--text);
        }
        .ai-msg.assistant .ai-bubble {
          background: var(--bg); border: 1px solid var(--border);
          border-bottom-left-radius: 4px;
        }
        .ai-msg.user .ai-bubble {
          background: var(--accent); color: white;
          border-bottom-right-radius: 4px;
        }

        .ai-typing { display: flex; gap: 4px; align-items: center; padding: 12px 14px; }
        .ai-typing span {
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--text3); animation: typing 1.2s ease infinite;
        }
        .ai-typing span:nth-child(2) { animation-delay: 0.2s; }
        .ai-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typing { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

        .ai-suggestions {
          padding: 8px 14px; display: flex; flex-wrap: wrap; gap: 6px;
        }
        .ai-suggestion {
          padding: 5px 10px; border-radius: 20px;
          border: 1px solid var(--border); background: var(--bg);
          font-size: 10px; color: var(--text2); cursor: pointer;
          font-family: var(--font); transition: all 0.15s;
        }
        .ai-suggestion:hover { border-color: var(--accent); color: var(--accent); }

        .ai-input-row {
          padding: 10px 12px; border-top: 1px solid var(--border);
          display: flex; gap: 8px; align-items: center;
        }
        .ai-input {
          flex: 1; padding: 9px 12px; border-radius: 8px;
          border: 1px solid var(--border); background: var(--bg);
          font-size: 12px; color: var(--text); font-family: var(--font);
          outline: none; transition: border-color 0.2s;
        }
        .ai-input:focus { border-color: var(--accent); }
        .ai-input::placeholder { color: var(--text3); }
        .ai-send {
          width: 34px; height: 34px; border-radius: 8px;
          background: var(--accent); border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: white; flex-shrink: 0; transition: opacity 0.2s;
        }
        .ai-send:disabled { opacity: 0.4; cursor: not-allowed; }

        /* ── CHANNELS ── */
        .channels-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
        }
        .channel-card {
          background: var(--bg2); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 20px 18px;
          cursor: pointer; transition: all 0.22s; position: relative;
          overflow: hidden;
        }
        .channel-card::after {
          content: '';
          position: absolute; right: -12px; bottom: -12px;
          width: 50px; height: 50px;
          border: 1.5px solid var(--channel-color, var(--accent));
          border-radius: 50%; opacity: 0.08;
        }
        .channel-card:hover { transform: translateY(-3px); box-shadow: 0 8px 32px rgba(0,0,0,0.07); }

        .channel-icon-wrap {
          width: 42px; height: 42px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 12px;
        }
        .channel-name { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
        .channel-desc { font-size: 11px; color: var(--text2); margin-bottom: 10px; line-height: 1.4; }
        .channel-status {
          font-size: 9px; font-weight: 700; letter-spacing: 0.5px;
          padding: 3px 8px; border-radius: 20px; display: inline-flex;
          align-items: center; gap: 5px;
        }
        .channel-status.connected {
          background: rgba(91,171,114,0.12); color: #3d8f55;
        }
        .channel-status.pending {
          background: rgba(252,174,145,0.15); color: var(--accent);
        }
        .channel-status-dot { width: 5px; height: 5px; border-radius: 50%; background: #5BAB72; }

        /* ── SETTINGS EXTRAS ── */
        .settings-select {
          padding: 6px 10px; border-radius: 8px;
          border: 1px solid var(--border); background: var(--bg);
          font-size: 12px; color: var(--text); font-family: var(--font);
          cursor: pointer; outline: none; transition: border-color 0.2s;
          flex-shrink: 0;
        }
        .settings-select:focus { border-color: var(--accent); }

        .settings-upload-btn {
          padding: 6px 12px; border-radius: 8px;
          border: 1px solid var(--border); background: var(--bg);
          font-size: 11px; color: var(--text2); cursor: pointer;
          font-family: var(--font); display: flex; align-items: center; gap: 5px;
          transition: all 0.15s; flex-shrink: 0;
        }
        .settings-upload-btn:hover { border-color: var(--accent); color: var(--accent); }

        /* ── BRAND COLORS ── */
        .brand-color-preview { margin-bottom: 4px; }
        .bcp-label { font-size: 11px; color: var(--text2); margin-bottom: 8px; }
        .bcp-swatches { display: flex; gap: 7px; }
        .bcp-swatch {
          width: 24px; height: 24px; border-radius: 50%;
          cursor: pointer; transition: transform 0.15s;
          border: 2px solid transparent;
        }
        .bcp-swatch.active { transform: scale(1.2); border-color: white; box-shadow: 0 0 0 2px var(--accent); }
        .bcp-swatch:hover:not(.active) { transform: scale(1.1); }

        /* ── NOTIFICATIONS ILLUSTRATION ── */
        .notif-illustration {
          display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;
        }
        .notif-bubble {
          display: flex; align-items: center;
          padding: 8px 12px; border-radius: 10px;
          font-size: 10px; font-weight: 500;
          border: 1px solid var(--border);
          animation: slideIn 0.3s ease both;
        }
        .notif-bubble-1 {
          background: rgba(252,174,145,0.06); color: var(--text);
          animation-delay: 0.05s;
        }
        .notif-bubble-2 {
          background: rgba(74,128,196,0.06); color: var(--text);
          animation-delay: 0.1s; margin-left: 12px;
        }
        .notif-bubble-3 {
          background: rgba(91,171,114,0.06); color: var(--text);
          animation-delay: 0.15s; margin-left: 24px;
        }
        @keyframes slideIn {
          from { transform: translateX(-8px); opacity: 0; }
          to { transform: none; opacity: 1; }
        }
        /* ── КОНТЕЙНЕР КАСТイメージНОГО СЕЛЕКТА ── */
        .cs-container {
          position: relative;
          width: 130px;
          font-family: var(--font);
          user-select: none;
        }

        /* Кнопка-триггер */
        .cs-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 14px;
          background: #1A1A1A;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          color: #FFFFFF;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .cs-trigger:hover {
          background: #242424;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
        }
        .cs-trigger.active {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(252, 174, 145, 0.2);
        }

        /* Вращение стрелочки при открытии */
        .cs-arrow {
          transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
          color: rgba(255, 255, 255, 0.6);
        }
        .cs-trigger.active .cs-arrow {
          transform: rotate(180deg);
          color: var(--accent);
        }

        /* ВЫЛЕТАЮЩЕЕ ОКОШКО (ЧЕРНОЕ, ЗАКРУГЛЕННОЕ) */
        .cs-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          width: 100%;
          background: #111111; /* Глубокий благородный черный */
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px; /* Мягкое красивое закругление */
          padding: 6px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 99;
          overflow: hidden;
          animation: csPopupIn 0.2s cubic-bezier(0.34, 1.3, 0.64, 1) both;
        }
        @keyframes csPopupIn {
          from { opacity: 0; transform: translateY(6px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Строчки внутри окошка */
        .cs-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 9px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        /* Эффект наведения на строчку */
        .cs-option:hover {
          background: rgba(252, 174, 145, 0.08); /* Нежная персиковая подсветка */
          color: #FFFFFF; /* Текст становится чисто белым */
          padding-left: 15px; /* Стильное микро-смещение текста вправо */
        }

        /* Стиль для уже выбранной строчки */
        .cs-option.selected {
          background: rgba(252, 174, 145, 0.15);
          color: var(--accent);
          font-weight: 700;
        }

        /* Иконка галочки у выбранного пункта */
        .cs-check {
          color: var(--accent);
          animation: csCheckPop 0.2s cubic-bezier(0.34, 1.5, 0.64, 1) both;
        }
        @keyframes csCheckPop {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        /* ── КОНТЕЙНЕР КАСТЕМНОГО СЕЛЕКТА ── */
        .cs-container {
          position: relative;
          width: 130px;
          font-family: var(--font);
          user-select: none;
        }

        /* Кнопка-триггер (ТЕПЕРЬ БЕЛАЯ ПОД СТИЛЬ КАРТОЧЕК) */
        .cs-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 14px;
          background: #FFFFFF; /* Чистый белый фон */
          border: 1.5px solid rgba(26, 26, 26, 0.09); /* Легкая аккуратная рамка */
          border-radius: 12px;
          color: #1A1A1A; /* Темный сочный текст */
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
        }
        .cs-trigger:hover {
          background: #F6F6F6; /* Слегка сероватый при наведении */
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }
        .cs-trigger.active {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(252, 174, 145, 0.25);
        }

        /* Стрелочка (меняет цвет на темный) */
        .cs-arrow {
          transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
          color: rgba(26, 26, 26, 0.4);
        }
        .cs-trigger.active .cs-arrow {
          transform: rotate(180deg);
          color: var(--accent);
        }

        /* ВЫЛЕТАЮЩЕЕ ОКОШКО (ОСТАЛОСЬ ЧЕРНЫМ) */
        .cs-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          width: 100%;
          background: #111111;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 6px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.2);
          z-index: 99;
          overflow: hidden;
          animation: csPopupIn 0.2s cubic-bezier(0.34, 1.3, 0.64, 1) both;
        }
        @keyframes csPopupIn {
          from { opacity: 0; transform: translateY(6px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Пункты внутри меню */
        .cs-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 9px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .cs-option:hover {
          background: rgba(252, 174, 145, 0.08);
          color: #FFFFFF;
          padding-left: 15px;
        }
        .cs-option.selected {
          background: rgba(252, 174, 145, 0.15);
          color: var(--accent);
          font-weight: 700;
        }

        .cs-check {
          color: var(--accent);
          animation: csCheckPop 0.2s cubic-bezier(0.34, 1.5, 0.64, 1) both;
        }
        @keyframes csCheckPop {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        /* ── СТИЛИ ВНУТРИ МОДАЛОК ── */
        .link-copy-block {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; background: #F6F6F6; border-radius: 10px;
          border: 1px dashed #DDD; cursor: pointer; margin-top: 8px;
          transition: all 0.2s;
        }
        .link-copy-block:hover { border-color: var(--accent); background: #FFF; }
        .link-copy-block span { font-size: 12px; font-weight: 700; color: var(--text); }

        .ins-step { display: flex; gap: 14px; margin-bottom: 16px; }
        .ins-num {
          width: 24px; height: 24px; border-radius: 50%; background: var(--text);
          color: white; display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 800; flex-shrink: 0;
        }
        .ins-text { font-size: 13px; color: var(--text2); line-height: 1.5; }

        .pro-tip {
          margin-top: 24px; padding: 14px; background: rgba(252,174,145,0.08);
          border-radius: 12px; border: 1px solid rgba(252,174,145,0.2);
          font-size: 12px; color: var(--text); line-height: 1.5;
        }
        .pro-badge {
          background: var(--accent); color: white; padding: 2px 6px;
          border-radius: 4px; font-size: 9px; font-weight: 900; margin-right: 8px;
        }

        /* Блок кода */
        .code-block {
          background: #1A1A1A; border-radius: 12px; padding: 16px;
          position: relative; margin-top: 20px;
        }
        .code-header { font-size: 10px; color: #666; font-weight: 800; margin-bottom: 12px; text-transform: uppercase; }
        .code-block pre { 
          margin: 0; color: #A3C9A8; font-size: 12px; font-family: monospace; 
          line-height: 1.5; overflow-x: auto;
        }
        .code-copy {
          position: absolute; top: 12px; right: 12px;
          background: rgba(255,255,255,0.1); border: none; border-radius: 6px;
          color: #FFF; font-size: 10px; padding: 4px 8px; cursor: pointer;
        }

        /* WhatsApp Preview */
        .wa-preview {
          background: #E5DDD5; padding: 20px; border-radius: 16px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .wa-bubble {
          max-width: 85%; padding: 8px 12px; border-radius: 10px;
          font-size: 12px; line-height: 1.4; position: relative;
          background: white; color: #000; align-self: flex-start;
        }
        .wa-bubble.bot {
          background: #DCF8C6; align-self: flex-end;
        }

        .wa-time {
          display: block; text-align: right; font-size: 8px; color: rgba(0,0,0,0.4);
          margin-top: 6px; line-height: 1;
        }
      `}</style>
    </>
  );
}