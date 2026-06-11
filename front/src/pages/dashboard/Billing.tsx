import { useState, useEffect, useRef } from "react";

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
const CheckIcon = ({ size = 16, color = "var(--peach)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="8" fill={color} fillOpacity="0.15" />
    <path d="M4.5 8.5L6.5 10.5L11.5 5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="8" fill="rgba(102,102,102,0.08)" />
    <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="#AAAAAA" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const StarIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1L8.545 5.09H13L9.5 7.56L10.91 11.5L7 9.13L3.09 11.5L4.5 7.56L1 5.09H5.455L7 1Z"
      fill={filled ? "#FCAE91" : "none"} stroke={filled ? "#FCAE91" : "#AAAAAA"} strokeWidth="1" strokeLinejoin="round" />
  </svg>
);

const ZapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M11 2L3 11H10L9 18L17 9H10L11 2Z" fill="var(--peach)" fillOpacity="0.2" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M10 2L3 5V10C3 14.1 6.1 17.9 10 19C13.9 17.9 17 14.1 17 10V5L10 2Z" fill="rgba(163,201,168,0.2)" stroke="var(--pistachio)" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7 10L9 12L13 8" stroke="var(--pistachio)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CreditCardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="4" width="16" height="12" rx="3" fill="var(--peach)" fillOpacity="0.15" stroke="var(--peach)" strokeWidth="1.5" />
    <path d="M2 8H18" stroke="var(--peach)" strokeWidth="1.5" />
    <rect x="4" y="11" width="4" height="2" rx="1" fill="var(--peach)" />
  </svg>
);

const PercentIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="6" cy="6" r="2.5" stroke="var(--peach)" strokeWidth="1.5" />
    <circle cx="14" cy="14" r="2.5" stroke="var(--peach)" strokeWidth="1.5" />
    <path d="M5 15L15 5" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="3" width="14" height="13" rx="3" stroke="var(--muted)" strokeWidth="1.5" />
    <path d="M6 2V4M12 2V4" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2 7H16" stroke="var(--muted)" strokeWidth="1.5" />
    <rect x="5" y="10" width="2" height="2" rx="0.5" fill="var(--muted)" />
    <rect x="8.5" y="10" width="2" height="2" rx="0.5" fill="var(--muted)" />
    <rect x="12" y="10" width="2" height="2" rx="0.5" fill="var(--muted)" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6.5" stroke="var(--muted)" strokeWidth="1.2" />
    <path d="M8 7V11" stroke="var(--muted)" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="5" r="0.75" fill="var(--muted)" />
  </svg>
);

const TrendingIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M2 13L6 9L10 11L16 5" stroke="var(--pistachio)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 5H16V9" stroke="var(--pistachio)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const HistoryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M2 9C2 5.13 5.13 2 9 2C12.87 2 16 5.13 16 9C16 12.87 12.87 16 9 16" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2 9C2 12.87 5.13 16 9 16" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
    <path d="M9 5V9L12 11" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 12L2 9L5 8" stroke="var(--muted)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 2V9M4 6.5L7 9.5L10 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 11H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2L10.1 6.9L15 8L10.1 9.1L9 14L7.9 9.1L3 8L7.9 6.9L9 2Z" fill="var(--peach)" fillOpacity="0.3" stroke="var(--peach)" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M14 2L14.6 4.4L17 5L14.6 5.6L14 8L13.4 5.6L11 5L13.4 4.4L14 2Z" fill="var(--peach)" fillOpacity="0.4" />
  </svg>
);

// ─── ANIMATED COUNTER ──────────────────────────────────────────────────────────
function AnimatedCounter({ target, prefix = "", suffix = "", duration = 1200 }: {
  target: number; prefix?: string; suffix?: string; duration?: number;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = 0;
        const step = Math.ceil(target / (duration / 16));
        const timer = setInterval(() => {
          start += step;
          if (start >= target) { setCount(target); clearInterval(timer); }
          else setCount(start);
        }, 16);
        observer.disconnect();
      }
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{prefix}{count.toLocaleString("ru-RU")}{suffix}</span>;
}

// ─── SAVINGS ILLUSTRATION ──────────────────────────────────────────────────────
function SavingsIllustration({ monthlyPrice, period, discount }: {
  monthlyPrice: number; period: number; discount: number;
}) {
  const total = monthlyPrice * period;
  const saved = Math.round(total * discount);
  const toPay = total - saved;
  const progress = discount * 100;

  return (
    <div style={{
      padding: "28px",
      background: "linear-gradient(135deg, rgba(252,174,145,0.06) 0%, rgba(249,160,139,0.02) 100%)",
      border: "1px solid rgba(252,174,145,0.2)",
      borderRadius: "20px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* BG glow */}
      <div style={{
        position: "absolute", top: "-30px", right: "-30px",
        width: "120px", height: "120px",
        background: "radial-gradient(circle, rgba(252,174,145,0.15) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
        <SparklesIcon />
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>
          Ваша экономия при оплате вперёд
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "13px", color: "var(--muted)" }}>Без скидки</span>
        <span style={{ fontSize: "13px", color: "var(--muted)", textDecoration: "line-through" }}>
          ₽{total.toLocaleString("ru-RU")}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: "6px", background: "var(--border)", borderRadius: "3px",
        marginBottom: "8px", overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${100 - progress}%`,
          background: "linear-gradient(90deg, var(--peach), #F9A08B)",
          borderRadius: "3px",
          transition: "width 0.8s cubic-bezier(0.34,1.1,0.64,1)",
        }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--onyx)", letterSpacing: "-0.5px" }}>
            ₽{toPay.toLocaleString("ru-RU")}
          </div>
          <div style={{ fontSize: "12px", color: "var(--pistachio)", fontWeight: 600 }}>
            За {period} {period === 1 ? "месяц" : period < 5 ? "месяца" : "месяцев"}
          </div>
        </div>
        <div style={{
          padding: "10px 16px",
          background: "rgba(163,201,168,0.15)",
          border: "1px solid rgba(163,201,168,0.3)",
          borderRadius: "12px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--pistachio)" }}>
            −{progress}%
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)" }}>
            ₽{saved.toLocaleString("ru-RU")} экономия
          </div>
        </div>
      </div>

      <div style={{
        padding: "12px 16px",
        background: "rgba(252,174,145,0.08)",
        borderRadius: "12px",
        fontSize: "12px",
        color: "var(--muted)",
        lineHeight: "1.6",
      }}>
        💡 Это как <strong style={{ color: "var(--onyx)" }}>
          {Math.round(saved / 990)} месяца бесплатно
        </strong> по сравнению с помесячной оплатой
      </div>
    </div>
  );
}

// ─── MAIN BILLING COMPONENT ───────────────────────────────────────────────────
export default function Billing() {
  const [billingMode, setBillingMode] = useState<"subscription" | "percent" | "fixed">("subscription");
  const [selectedPlan, setSelectedPlan] = useState<"start" | "pro" | "business">("pro");
  const [selectedPeriod, setSelectedPeriod] = useState<1 | 6 | 12 | 24>(1);
  const [fixedAmount, setFixedAmount] = useState(5000);
  const [percentAmount, setPercentAmount] = useState(5);
  const [estimatedRevenue, setEstimatedRevenue] = useState(300000);
  const [activeTab, setActiveTab] = useState<"plans" | "invoices" | "method">("plans");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [animateCards, setAnimateCards] = useState(false);

  useEffect(() => {
    setTimeout(() => setAnimateCards(true), 100);
  }, []);

  const plans = {
    start:    { name: "Старт",    monthly: 990,  color: "#A3C9A8" },
    pro:      { name: "Pro",      monthly: 2490, color: "#FCAE91" },
    business: { name: "Business", monthly: 5990, color: "#1A1A1A" },
  };

  const periodDiscounts: Record<number, number> = { 1: 0, 6: 0.20, 12: 0.30, 24: 0.40 };

  const getPrice = (plan: keyof typeof plans, period: number) => {
    const base = plans[plan].monthly;
    const disc = periodDiscounts[period] || 0;
    return Math.round(base * (1 - disc));
  };

  const invoices = [
    { date: "01.06.2025", amount: "₽2 490", status: "paid",    desc: "Pro — июнь 2025" },
    { date: "01.05.2025", amount: "₽2 490", status: "paid",    desc: "Pro — май 2025" },
    { date: "01.04.2025", amount: "₽2 490", status: "paid",    desc: "Pro — апрель 2025" },
    { date: "01.03.2025", amount: "₽2 490", status: "paid",    desc: "Pro — март 2025" },
    { date: "01.02.2025", amount: "₽2 490", status: "paid",    desc: "Pro — февраль 2025" },
    { date: "01.01.2025", amount: "₽990",   status: "paid",    desc: "Старт — январь 2025" },
  ];

  const planFeatures = {
    start: [
      { text: "До 3 сотрудников",     on: true },
      { text: "До 100 клиентов",       on: true },
      { text: "Онлайн-запись",         on: true },
      { text: "Базовый календарь",     on: true },
      { text: "Аналитика",             on: false },
      { text: "API-доступ",            on: false },
      { text: "Лояльность и CRM",      on: false },
      { text: "White-label",           on: false },
    ],
    pro: [
      { text: "До 20 сотрудников",     on: true },
      { text: "Неограниченно клиентов", on: true },
      { text: "Полная аналитика",      on: true },
      { text: "Лояльность и CRM",      on: true },
      { text: "Telegram-уведомления",  on: true },
      { text: "Приоритетная поддержка", on: true },
      { text: "API-доступ",            on: false },
      { text: "White-label",           on: false },
    ],
    business: [
      { text: "Неограниченно всё",     on: true },
      { text: "White-label",           on: true },
      { text: "API-доступ",            on: true },
      { text: "Мультифилиалы",         on: true },
      { text: "Выделенный менеджер",   on: true },
      { text: "Кастомные интеграции",  on: true },
      { text: "SLA 99.9%",             on: true },
      { text: "Обучение команды",      on: true },
    ],
  };

  const currentMonthly = plans[selectedPlan].monthly;
  const discountedPrice = getPrice(selectedPlan, selectedPeriod);
  const totalToPay = discountedPrice * selectedPeriod;
  const savedTotal = currentMonthly * selectedPeriod - totalToPay;

  return (
    <div style={{ padding: "0 0 60px 0" }}>

      {/* ─── PAGE HEADER ─── */}
      <div style={{
        padding: "32px 32px 0",
        marginBottom: "32px",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p style={{
              fontSize: "11px", fontWeight: 700, color: "var(--peach)",
              letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px",
            }}>Velora · Биллинг</p>
            <h1 style={{
              fontSize: "32px", fontWeight: 900, color: "var(--onyx)",
              letterSpacing: "-1.2px", lineHeight: "1.1", marginBottom: "8px",
            }}>Тарифы и оплата</h1>
            <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: "1.6" }}>
              Управляйте подпиской, способами оплаты и историей платежей
            </p>
          </div>

          {/* Current plan badge */}
          <div style={{
            padding: "16px 24px",
            background: "linear-gradient(135deg, rgba(252,174,145,0.12) 0%, rgba(249,160,139,0.06) 100%)",
            border: "1px solid rgba(252,174,145,0.3)",
            borderRadius: "16px",
            textAlign: "right",
          }}>
            <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px", letterSpacing: "0.5px" }}>
              ТЕКУЩИЙ ТАРИФ
            </div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--onyx)" }}>Pro</div>
            <div style={{ fontSize: "12px", color: "var(--pistachio)", fontWeight: 600, marginTop: "2px" }}>
              Активен · до 15 июля 2025
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "6px" }}>
              <CalendarIcon />
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>₽2 490 / мес</span>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px", marginTop: "24px",
        }}>
          {[
            { label: "Потрачено всего", value: 17430, prefix: "₽", icon: <CreditCardIcon /> },
            { label: "Месяцев с нами", value: 7, suffix: " мес.", icon: <CalendarIcon /> },
            { label: "Сэкономлено", value: 0, prefix: "₽", suffix: " (пока)", icon: <TrendingIcon /> },
            { label: "Следующее списание", value: 2490, prefix: "₽", icon: <ZapIcon /> },
          ].map((stat, i) => (
            <div key={i} style={{
              padding: "16px 20px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "14px",
              boxShadow: "var(--shadow)",
              display: "flex", alignItems: "center", gap: "12px",
              opacity: animateCards ? 1 : 0,
              transform: animateCards ? "none" : "translateY(8px)",
              transition: `all 0.5s ease ${i * 0.07}s`,
            }}>
              <div style={{
                width: "36px", height: "36px",
                background: "rgba(252,174,145,0.08)",
                borderRadius: "10px",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>{stat.icon}</div>
              <div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--onyx)", letterSpacing: "-0.4px" }}>
                  <AnimatedCounter target={stat.value} prefix={stat.prefix} suffix={stat.suffix || ""} />
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "1px" }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── TABS ─── */}
      <div style={{ padding: "0 32px", marginBottom: "28px" }}>
        <div style={{
          display: "inline-flex", gap: "4px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px", padding: "4px",
        }}>
          {([
            { id: "plans",   label: "Тарифы и планы" },
            { id: "invoices", label: "История платежей" },
            { id: "method",  label: "Способ оплаты" },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 18px",
                borderRadius: "9px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                fontFamily: "inherit",
                transition: "all 0.2s ease",
                background: activeTab === tab.id ? "var(--peach)" : "transparent",
                color: activeTab === tab.id ? "white" : "var(--muted)",
                boxShadow: activeTab === tab.id ? "0 2px 12px rgba(252,174,145,0.35)" : "none",
              }}
            >{tab.label}</button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: PLANS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "plans" && (
        <div style={{ padding: "0 32px" }}>

          {/* ── BILLING MODE SELECTOR ── */}
          <div style={{
            padding: "28px 32px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            boxShadow: "var(--shadow)",
            marginBottom: "20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <PercentIcon />
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)" }}>
                Модель оплаты
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {[
                {
                  id: "subscription" as const,
                  icon: <CreditCardIcon />,
                  title: "Фиксированная подписка",
                  desc: "Платите одну сумму в месяц. Предсказуемо и выгодно.",
                  badge: "Популярно",
                },
                {
                  id: "percent" as const,
                  icon: <PercentIcon />,
                  title: "% с онлайн-платежей",
                  desc: "Платите только когда зарабатываете. От 2% до 8% от транзакций.",
                  badge: null,
                },
                {
                  id: "fixed" as const,
                  icon: <ZapIcon />,
                  title: "Фикс + % комбо",
                  desc: "Сниженная подписка + небольшой % для активного роста.",
                  badge: "Гибко",
                },
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setBillingMode(mode.id)}
                  style={{
                    padding: "20px",
                    borderRadius: "14px",
                    border: `1.5px solid ${billingMode === mode.id ? "var(--peach)" : "var(--border)"}`,
                    cursor: "pointer",
                    textAlign: "left",
                    background: billingMode === mode.id
                      ? "linear-gradient(135deg, rgba(252,174,145,0.1) 0%, rgba(249,160,139,0.04) 100%)"
                      : "transparent",
                    transition: "all 0.25s ease",
                    fontFamily: "inherit",
                    position: "relative",
                    boxShadow: billingMode === mode.id ? "0 4px 20px rgba(252,174,145,0.15)" : "none",
                  }}
                >
                  {mode.badge && (
                    <div style={{
                      position: "absolute", top: "-8px", right: "12px",
                      padding: "2px 10px",
                      background: "var(--peach)",
                      color: "white",
                      fontSize: "10px", fontWeight: 700,
                      borderRadius: "100px",
                      letterSpacing: "0.5px",
                    }}>{mode.badge}</div>
                  )}
                  <div style={{ marginBottom: "10px" }}>{mode.icon}</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)", marginBottom: "6px" }}>
                    {mode.title}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: "1.5" }}>
                    {mode.desc}
                  </div>
                  {billingMode === mode.id && (
                    <div style={{
                      position: "absolute", bottom: "14px", right: "14px",
                    }}>
                      <CheckIcon size={18} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Percent / Fixed amount selectors */}
            {/* ─── ЖИВОЙ КАЛЬКУЛЯТОР ДЛЯ РЕЖИМА "ПРОЦЕНТ" ─── */}
            {billingMode === "percent" && (
              <div style={{ marginTop: "24px", animation: "fadeSlideIn 0.4s ease forwards" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  
                  {/* Левая панель: Настройки */}
                  <div style={{ padding: "32px", background: "rgba(252,174,145,0.03)", border: "1px solid rgba(252,174,145,0.15)", borderRadius: "20px" }}>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--onyx)", marginBottom: "28px" }}>Параметры расчёта</div>
                    
                    <div style={{ marginBottom: "32px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "16px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--muted)" }}>Ваш онлайн-оборот в месяц</span>
                        <span style={{ fontSize: "22px", fontWeight: 900, color: "var(--peach)", letterSpacing: "-0.5px" }}>
                          ₽{estimatedRevenue.toLocaleString("ru-RU")}
                        </span>
                      </div>
                      <input 
                        type="range" className="premium-slider"
                        min="50000" max="3000000" step="50000" 
                        value={estimatedRevenue} 
                        onChange={e => setEstimatedRevenue(Number(e.target.value))}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", fontSize: "11px", fontWeight: 600, color: "var(--muted)" }}>
                        <span>50 тыс.</span>
                        <span>3 млн+</span>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--muted)", marginBottom: "14px" }}>Выберите процент комиссии (влияет на функции)</div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {[
                          { p: 2, label: "Базовый" }, { p: 3, label: "Стандарт" }, 
                          { p: 5, label: "Pro" }, { p: 8, label: "Максимум" }
                        ].map(opt => (
                          <button
                            key={opt.p}
                            onClick={() => setPercentAmount(opt.p)}
                            style={{
                              flex: "1 1 calc(50% - 4px)",
                              padding: "12px 16px", borderRadius: "12px",
                              border: `1.5px solid ${percentAmount === opt.p ? "var(--peach)" : "var(--border)"}`,
                              background: percentAmount === opt.p ? "var(--peach)" : "#FFFFFF",
                              color: percentAmount === opt.p ? "white" : "var(--onyx)",
                              cursor: "pointer", transition: "all 0.2s ease",
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                              boxShadow: percentAmount === opt.p ? "0 4px 12px rgba(252,174,145,0.3)" : "none",
                            }}
                          >
                            <span style={{ fontSize: "12px", fontWeight: 600, opacity: percentAmount === opt.p ? 0.9 : 0.6 }}>{opt.label}</span>
                            <span style={{ fontSize: "16px", fontWeight: 800 }}>{opt.p}%</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Правая панель: Интерактивный Чек (Receipt) */}
                  <div style={{ padding: "32px", background: "linear-gradient(135deg, var(--onyx) 0%, #2A2A2A 100%)", borderRadius: "20px", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "250px", height: "250px", background: "radial-gradient(circle, rgba(252,174,145,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
                    
                    <div style={{ position: "relative", zIndex: 1, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "32px" }}>
                        <PercentIcon />
                        <span style={{ fontSize: "13px", fontWeight: 800, letterSpacing: "1px", color: "rgba(255,255,255,0.5)" }}>ЭКОНОМИКА ТАРИФА</span>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px dashed rgba(255,255,255,0.15)", paddingBottom: "16px" }}>
                        <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.8)" }}>Оборот студии</span>
                        <span style={{ fontSize: "16px", fontWeight: 600, color: "white" }}>₽{estimatedRevenue.toLocaleString("ru-RU")}</span>
                      </div>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.8)" }}>Комиссия системы</span>
                          <span style={{ padding: "2px 8px", background: "rgba(252,174,145,0.2)", borderRadius: "100px", color: "var(--peach)", fontSize: "10px", fontWeight: 800 }}>{percentAmount}%</span>
                        </div>
                        <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--peach)" }}>
                          − ₽{(estimatedRevenue * (percentAmount / 100)).toLocaleString("ru-RU")}
                        </span>
                      </div>

                      <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: "16px", padding: "24px", marginBottom: "24px", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: "8px", letterSpacing: "0.5px" }}>ИТОГОВЫЙ ПЛАТЕЖ В МЕСЯЦ</div>
                        <div style={{ fontSize: "36px", fontWeight: 900, color: "white", letterSpacing: "-1px" }}>
                          ₽{(estimatedRevenue * (percentAmount / 100)).toLocaleString("ru-RU")}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px", color: "var(--pistachio)", fontSize: "12px", fontWeight: 600 }}>
                          <CheckIcon size={14} color="var(--pistachio)" /> Вы не платите фикс, только за результат
                        </div>
                      </div>
                    </div>

                    <button style={{ width: "100%", padding: "16px", borderRadius: "14px", background: "var(--peach)", color: "white", fontSize: "14px", fontWeight: 800, border: "none", cursor: "pointer", boxShadow: "0 8px 24px rgba(252,174,145,0.3)", transition: "transform 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                      Активировать модель за {percentAmount}%
                    </button>
                  </div>

                </div>
              </div>
            )}

            {/* ─── ЖИВОЙ КАЛЬКУЛЯТОР ДЛЯ РЕЖИМА "ФИКС + % КОМБО" ─── */}
            {billingMode === "fixed" && (
              <div style={{ marginTop: "24px", animation: "fadeSlideIn 0.4s ease forwards" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  
                  {/* Левая панель */}
                  <div style={{ padding: "32px", background: "rgba(163,201,168,0.05)", border: "1px solid rgba(163,201,168,0.2)", borderRadius: "20px" }}>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--onyx)", marginBottom: "28px" }}>Параметры расчёта</div>
                    
                    <div style={{ marginBottom: "32px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "16px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--muted)" }}>Ваш онлайн-оборот в месяц</span>
                        <span style={{ fontSize: "22px", fontWeight: 900, color: "var(--pistachio)", letterSpacing: "-0.5px" }}>
                          ₽{estimatedRevenue.toLocaleString("ru-RU")}
                        </span>
                      </div>
                      <input 
                        type="range" className="premium-slider"
                        style={{ border: "2px solid var(--pistachio)" }} // Акцент на фисташковый
                        min="50000" max="3000000" step="50000" 
                        value={estimatedRevenue} 
                        onChange={e => setEstimatedRevenue(Number(e.target.value))}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--muted)", marginBottom: "14px" }}>Выберите базовую фикс-часть (эквайринг всегда 3%)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                        {[
                          { a: 990, label: "Старт" }, { a: 1490, label: "Оптима" }, { a: 1990, label: "Бизнес" }
                        ].map(opt => (
                          <button
                            key={opt.a}
                            onClick={() => setFixedAmount(opt.a)}
                            style={{
                              padding: "14px 10px", borderRadius: "12px",
                              border: `1.5px solid ${fixedAmount === opt.a ? "var(--pistachio)" : "var(--border)"}`,
                              background: fixedAmount === opt.a ? "var(--pistachio)" : "#FFFFFF",
                              color: fixedAmount === opt.a ? "white" : "var(--onyx)",
                              cursor: "pointer", transition: "all 0.2s ease",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                              boxShadow: fixedAmount === opt.a ? "0 4px 12px rgba(163,201,168,0.4)" : "none",
                            }}
                          >
                            <span style={{ fontSize: "11px", fontWeight: 600, opacity: fixedAmount === opt.a ? 0.9 : 0.6 }}>{opt.label}</span>
                            <span style={{ fontSize: "15px", fontWeight: 800 }}>₽{opt.a.toLocaleString("ru-RU")}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Правая панель (Receipt) */}
                  <div style={{ padding: "32px", background: "linear-gradient(135deg, var(--onyx) 0%, #2A2A2A 100%)", borderRadius: "20px", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "250px", height: "250px", background: "radial-gradient(circle, rgba(163,201,168,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
                    
                    <div style={{ position: "relative", zIndex: 1, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "32px" }}>
                        <ZapIcon />
                        <span style={{ fontSize: "13px", fontWeight: 800, letterSpacing: "1px", color: "rgba(255,255,255,0.5)" }}>ЭКОНОМИКА КОМБО-ТАРИФА</span>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                        <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.8)" }}>Базовая подписка (Fix)</span>
                        <span style={{ fontSize: "16px", fontWeight: 600, color: "white" }}>₽{fixedAmount.toLocaleString("ru-RU")}</span>
                      </div>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", borderBottom: "1px dashed rgba(255,255,255,0.15)", paddingBottom: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.8)" }}>Эквайринг / Комиссия</span>
                          <span style={{ padding: "2px 8px", background: "rgba(163,201,168,0.2)", borderRadius: "100px", color: "var(--pistachio)", fontSize: "10px", fontWeight: 800 }}>3%</span>
                        </div>
                        <span style={{ fontSize: "16px", fontWeight: 600, color: "white" }}>
                          + ₽{(estimatedRevenue * 0.03).toLocaleString("ru-RU")}
                        </span>
                      </div>

                      <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: "16px", padding: "24px", marginBottom: "24px", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: "8px", letterSpacing: "0.5px" }}>ИТОГОВЫЙ ПЛАТЕЖ В МЕСЯЦ</div>
                        <div style={{ fontSize: "36px", fontWeight: 900, color: "white", letterSpacing: "-1px" }}>
                          ₽{(fixedAmount + (estimatedRevenue * 0.03)).toLocaleString("ru-RU")}
                        </div>
                      </div>
                    </div>

                    <button style={{ width: "100%", padding: "16px", borderRadius: "14px", background: "var(--pistachio)", color: "white", fontSize: "14px", fontWeight: 800, border: "none", cursor: "pointer", boxShadow: "0 8px 24px rgba(163,201,168,0.3)", transition: "transform 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                      Активировать Комбо-тариф
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── PERIOD SELECTOR ── */}
          {billingMode === "subscription" && (
            <div style={{
              padding: "24px 32px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "20px",
              boxShadow: "var(--shadow)",
              marginBottom: "20px",
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: "20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <CalendarIcon />
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)" }}>
                    Период оплаты
                  </span>
                </div>
                {selectedPeriod > 1 && (
                  <div style={{
                    padding: "4px 12px",
                    background: "rgba(163,201,168,0.15)",
                    border: "1px solid rgba(163,201,168,0.3)",
                    borderRadius: "100px",
                    fontSize: "12px", fontWeight: 700, color: "var(--pistachio)",
                  }}>
                    Скидка {periodDiscounts[selectedPeriod] * 100}% активна
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                {([
                  { period: 1  as 1,  label: "1 месяц",   sub: "Без скидки",   discount: 0 },
                  { period: 6  as 6,  label: "6 месяцев", sub: "−20% скидка",  discount: 20 },
                  { period: 12 as 12, label: "1 год",      sub: "−30% скидка",  discount: 30, popular: true },
                  { period: 24 as 24, label: "2 года",     sub: "−40% скидка",  discount: 40 },
                ]).map(opt => (
                  <button
                    key={opt.period}
                    onClick={() => setSelectedPeriod(opt.period)}
                    style={{
                      padding: "16px",
                      borderRadius: "14px",
                      border: `1.5px solid ${selectedPeriod === opt.period ? "var(--peach)" : "var(--border)"}`,
                      cursor: "pointer",
                      textAlign: "center",
                      background: selectedPeriod === opt.period
                        ? "linear-gradient(135deg, rgba(252,174,145,0.12) 0%, rgba(249,160,139,0.04) 100%)"
                        : "transparent",
                      transition: "all 0.25s ease",
                      fontFamily: "inherit",
                      position: "relative",
                      boxShadow: selectedPeriod === opt.period ? "0 4px 20px rgba(252,174,145,0.15)" : "none",
                    }}
                  >
                    {opt.popular && (
                      <div style={{
                        position: "absolute", top: "-8px", left: "50%",
                        transform: "translateX(-50%)",
                        padding: "2px 10px",
                        background: "var(--peach)",
                        color: "white",
                        fontSize: "10px", fontWeight: 700,
                        borderRadius: "100px", whiteSpace: "nowrap",
                        letterSpacing: "0.5px",
                      }}>Лучший выбор</div>
                    )}
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--onyx)", marginBottom: "4px" }}>
                      {opt.label}
                    </div>
                    <div style={{
                      fontSize: "12px", fontWeight: 600,
                      color: opt.discount > 0 ? "var(--pistachio)" : "var(--muted)",
                    }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── PLAN CARDS ── */}
          {billingMode === "subscription" && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
              gap: "16px", marginBottom: "20px",
              animation: "fadeSlideIn 0.4s ease forwards" // Плавное появление при возврате
            }}>
              {(["start", "pro", "business"] as const).map((planId, i) => {
                const plan = plans[planId];
                const features = planFeatures[planId];
                const price = getPrice(planId, selectedPeriod); // Убрали лишнюю проверку, так как тут всегда subscription
                const isSelected = selectedPlan === planId;
                const isCurrent = planId === "pro";

                return (
                  <div
                    key={planId}
                    onClick={() => setSelectedPlan(planId)}
                    style={{
                      padding: "28px",
                      background: "var(--bg-card)",
                      border: `2px solid ${isSelected ? "var(--peach)" : "var(--border)"}`,
                      borderRadius: "20px",
                      cursor: "pointer",
                      position: "relative",
                      boxShadow: isSelected
                        ? "0 8px 40px rgba(252,174,145,0.18)"
                        : "var(--shadow)",
                      transition: "all 0.3s cubic-bezier(0.34,1.1,0.64,1)",
                      transform: isSelected ? "translateY(-3px)" : "none",
                      opacity: animateCards ? 1 : 0,
                      transitionDelay: `${i * 0.08}s`,
                    }}
                  >
                    {/* Badges */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                      <div style={{
                        width: "40px", height: "40px",
                        borderRadius: "12px",
                        background: `${plan.color}20`,
                        border: `1.5px solid ${plan.color}40`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <div style={{
                          width: "16px", height: "16px",
                          borderRadius: "50%",
                          background: plan.color,
                        }} />
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {isCurrent && (
                          <span style={{
                            padding: "3px 10px",
                            background: "rgba(252,174,145,0.15)",
                            border: "1px solid rgba(252,174,145,0.3)",
                            borderRadius: "100px",
                            fontSize: "10px", fontWeight: 700, color: "var(--peach)",
                          }}>Текущий</span>
                        )}
                        {planId === "business" && (
                          <span style={{
                            padding: "3px 10px",
                            background: "rgba(26,26,26,0.08)",
                            border: "1px solid rgba(26,26,26,0.12)",
                            borderRadius: "100px",
                            fontSize: "10px", fontWeight: 700, color: "var(--onyx)",
                          }}>Enterprise</span>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--onyx)", marginBottom: "4px" }}>
                      {plan.name}
                    </div>

                    <div style={{ marginBottom: "4px" }}>
                      <span style={{ fontSize: "32px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-1px" }}>
                        ₽{price.toLocaleString("ru-RU")}
                      </span>
                      <span style={{ fontSize: "13px", color: "var(--muted)", marginLeft: "4px" }}>/ мес.</span>
                    </div>

                    {selectedPeriod > 1 && (
                      <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "16px" }}>
                        <span style={{ textDecoration: "line-through" }}>₽{plan.monthly.toLocaleString("ru-RU")}</span>
                        <span style={{ color: "var(--pistachio)", fontWeight: 700, marginLeft: "6px" }}>
                          −{periodDiscounts[selectedPeriod] * 100}%
                        </span>
                      </div>
                    )}

                    <div style={{
                      height: "1px",
                      background: "var(--border)",
                      margin: "16px 0",
                    }} />

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                      {features.map((feat, fi) => (
                        <div key={fi} style={{
                          display: "flex", alignItems: "center", gap: "10px",
                          opacity: feat.on ? 1 : 0.4,
                        }}>
                          {feat.on
                            ? <CheckIcon size={16} color={plan.color === "#1A1A1A" ? "var(--onyx)" : plan.color} />
                            : <XIcon size={16} />
                          }
                          <span style={{
                            fontSize: "13px",
                            color: feat.on ? "var(--onyx)" : "var(--muted)",
                            fontWeight: feat.on ? 500 : 400,
                          }}>{feat.text}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlan(planId);
                        if (!isCurrent) setShowUpgradeModal(true);
                      }}
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "12px",
                        border: isCurrent ? "1.5px solid var(--border)" : "none",
                        background: isCurrent
                          ? "transparent"
                          : planId === "business"
                            ? "var(--onyx)"
                            : "var(--peach)",
                        color: isCurrent ? "var(--muted)" : "white",
                        fontSize: "13px", fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                        transition: "all 0.2s ease",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      }}
                    >
                      {isCurrent ? "Текущий план" : "Выбрать план"}
                      {!isCurrent && <ArrowRightIcon />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SAVINGS ILLUSTRATION + PERIOD SUMMARY ── */}
          {billingMode === "subscription" && (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: "16px", marginBottom: "20px",
            }}>
              <SavingsIllustration
                monthlyPrice={currentMonthly}
                period={selectedPeriod}
                discount={periodDiscounts[selectedPeriod]}
              />

              {/* Timeline visualization */}
              <div style={{
                padding: "28px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "20px",
                boxShadow: "var(--shadow)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                  <HistoryIcon />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>
                    График платежей
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {Array.from({ length: Math.min(selectedPeriod, 6) }).map((_, idx) => {
                    const date = new Date();
                    date.setMonth(date.getMonth() + idx);
                    const label = date.toLocaleDateString("ru-RU", { month: "short", year: idx === 0 ? "numeric" : undefined });
                    const isPaid = idx === 0;
                    return (
                      <div key={idx} style={{
                        display: "flex", alignItems: "center", gap: "12px",
                        opacity: isPaid ? 1 : 0.65,
                      }}>
                        <div style={{
                          width: "8px", height: "8px", borderRadius: "50%",
                          background: isPaid ? "var(--pistachio)" : "var(--border)",
                          flexShrink: 0,
                        }} />
                        <div style={{
                          flex: 1, height: "1px",
                          background: isPaid
                            ? "linear-gradient(90deg, var(--pistachio), transparent)"
                            : "var(--border)",
                        }} />
                        <div style={{ fontSize: "12px", color: "var(--muted)", minWidth: "60px", textAlign: "right" }}>
                          {label}
                        </div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--onyx)", minWidth: "80px", textAlign: "right" }}>
                          ₽{discountedPrice.toLocaleString("ru-RU")}
                        </div>
                      </div>
                    );
                  })}
                  {selectedPeriod > 6 && (
                    <div style={{ fontSize: "12px", color: "var(--muted)", paddingLeft: "20px" }}>
                      + ещё {selectedPeriod - 6} платежей по ₽{discountedPrice.toLocaleString("ru-RU")}
                    </div>
                  )}
                </div>

                <div style={{
                  marginTop: "20px", padding: "14px 16px",
                  background: "var(--bg)",
                  borderRadius: "12px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontSize: "13px", color: "var(--muted)" }}>Итого к оплате</span>
                  <span style={{ fontSize: "18px", fontWeight: 800, color: "var(--onyx)" }}>
                    ₽{totalToPay.toLocaleString("ru-RU")}
                  </span>
                </div>

                <button style={{
                  marginTop: "12px",
                  width: "100%",
                  padding: "13px",
                  borderRadius: "12px",
                  border: "none",
                  background: "var(--peach)",
                  color: "white",
                  fontSize: "14px", fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.2s ease",
                  boxShadow: "0 4px 20px rgba(252,174,145,0.35)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                }}>
                  <ZapIcon />
                  Оплатить {selectedPeriod > 1 ? `${selectedPeriod} месяцев` : ""}
                </button>
              </div>
            </div>
          )}

          {/* ── FAQ / TRUST BLOCK ── */}
          <div style={{
            padding: "28px 32px",
            background: "linear-gradient(135deg, var(--onyx) 0%, #2A2A2A 100%)",
            borderRadius: "20px",
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", top: "-40%", right: "-10%",
              width: "300px", height: "300px",
              background: "radial-gradient(ellipse, rgba(252,174,145,0.12) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
                <ShieldIcon />
                <span style={{ fontSize: "15px", fontWeight: 700, color: "white" }}>
                  Почему нам доверяют 2 400+ бизнесов
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                {[
                  { stars: 5, text: "Перешли с Altegio. Разница как между такси и бизнес-джетом.", author: "Мария К., пилатес FORM" },
                  { stars: 5, text: "Удобнее всего, что я знаю ровно сколько плачу каждый месяц. Никаких сюрпризов.", author: "Артём Н., Barbershop Bros" },
                  { stars: 5, text: "Поддержка ответила за 4 минуты. Такого я ещё не видела нигде.", author: "Елена Д., SPA LUNA" },
                ].map((review, i) => (
                  <div key={i} style={{
                    padding: "18px 20px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "14px",
                  }}>
                    <div style={{ display: "flex", gap: "2px", marginBottom: "10px" }}>
                      {[...Array(5)].map((_, si) => <StarIcon key={si} filled={si < review.stars} />)}
                    </div>
                    <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", lineHeight: "1.6", marginBottom: "10px" }}>
                      {review.text}
                    </div>
                    <div style={{ fontSize: "11px", color: "rgba(252,174,145,0.8)", fontWeight: 600 }}>
                      {review.author}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: INVOICES
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "invoices" && (
        <div style={{ padding: "0 32px" }}>

          {/* Spend summary (Интерактивный дашборд) */}
          <div style={{
            padding: "32px 36px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            boxShadow: "var(--shadow)",
            marginBottom: "24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "40px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <TrendingIcon />
                <span style={{ fontSize: "16px", fontWeight: 800, color: "var(--onyx)" }}>
                  Динамика расходов за 2 года
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "24px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.5px" }}>
                  ₽59 760
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginTop: "2px" }}>
                  общие траты за 24 месяца
                </div>
              </div>
            </div>

            {/* 🔥 ВЫСОКИЙ ИНТЕРАКТИВНЫЙ ГРАФИК НА 24 СВЕЧИ */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "180px", position: "relative" }}>
              {Array.from({ length: 24 }).map((_, i) => {
                // Генерация правильных дат для последних 24 месяцев
                const months = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
                const date = new Date();
                date.setMonth(date.getMonth() - (23 - i));
                const label = `${months[date.getMonth()]} '${date.getFullYear().toString().slice(2)}`;
                
                // Имитация истории (начинали со Старта 990₽, потом Pro 2490₽, пару раз брали Business 5990₽)
                let val = 2490;
                if (i < 8) val = 990; 
                if (i === 14 || i === 19) val = 5990; 
                if (i === 23) val = 2490; // Текущий месяц

                const max = 6500; // Потолок графика для расчета высоты
                const height = Math.max((val / max) * 150, 10); // Минимум 10px высоты, Максимум 150px
                const isCurrent = i === 23;

                return (
                  <div key={i} className="chart-bar-group" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    
                    {/* Тултип с точными данными */}
                    <div className="chart-tooltip">
                      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", marginBottom: "4px", fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: "14px" }}>₽{val.toLocaleString("ru-RU")}</div>
                    </div>

                    {/* Сам столбик (Свеча) */}
                    <div className="bar-fill" style={{
                      width: "100%", maxWidth: "24px", height: `${height}px`,
                      background: isCurrent
                        ? "linear-gradient(180deg, var(--peach), #F9A08B)"
                        : val > 3000 ? "rgba(26,26,26,0.3)" : "rgba(252,174,145,0.25)",
                      borderRadius: "6px 6px 4px 4px",
                      boxShadow: isCurrent ? "0 4px 16px rgba(252,174,145,0.4)" : "none",
                    }} />

                    {/* Подписи оси X (Скрываем часть, чтобы не было визуальной каши) */}
                    <div style={{ 
                      fontSize: "10px", color: "var(--muted)", fontWeight: 600, 
                      opacity: i % 3 === 0 || isCurrent ? 1 : 0, // Показываем каждый 3-й месяц и текущий
                      whiteSpace: "nowrap" 
                    }}>
                      {i % 3 === 0 || isCurrent ? label : "·"}
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          {/* Invoice table */}
          <div style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            boxShadow: "var(--shadow)",
            overflow: "hidden",
          }}>
            <div style={{
              padding: "20px 28px",
              borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <HistoryIcon />
                <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)" }}>
                  История платежей
                </span>
              </div>
              <button style={{
                padding: "8px 16px",
                borderRadius: "10px",
                border: "1.5px solid var(--border)",
                background: "transparent",
                color: "var(--muted)",
                fontSize: "12px", fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: "6px",
                transition: "all 0.2s ease",
              }}>
                <DownloadIcon />
                Экспорт CSV
              </button>
            </div>

            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr",
              padding: "12px 28px",
              borderBottom: "1px solid var(--border)",
              background: "rgba(102,102,102,0.03)",
            }}>
              {["Дата", "Описание", "Сумма", "Чек"].map(h => (
                <div key={h} style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                  {h}
                </div>
              ))}
            </div>

            {invoices.map((inv, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr",
                padding: "16px 28px",
                borderBottom: i < invoices.length - 1 ? "1px solid var(--border)" : "none",
                alignItems: "center",
                transition: "background 0.15s ease",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(252,174,145,0.03)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ fontSize: "13px", color: "var(--muted)" }}>{inv.date}</div>
                <div style={{ fontSize: "13px", color: "var(--onyx)", fontWeight: 500 }}>{inv.desc}</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>{inv.amount}</div>
                <div>
                  <button style={{
                    padding: "5px 12px",
                    borderRadius: "8px",
                    border: "1.5px solid var(--border)",
                    background: "transparent",
                    color: "var(--muted)",
                    fontSize: "11px", fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: "4px",
                  }}>
                    <DownloadIcon />
                    PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: PAYMENT METHOD (Premium Interactive Morphing Checkout)
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "method" && (
        <div style={{ padding: "0 32px", animation: "fadeSlideIn 0.4s ease forwards" }}>
          <PaymentMethodSection triggerToast={(msg: string) => alert(msg)} /> {/* Если у тебя есть кастомный triggerToast в файле, он подхватится автоматически */}
        </div>
      )}

      {/* ─── UPGRADE MODAL ─── */}
      {showUpgradeModal && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(26,26,26,0.6)",
          backdropFilter: "blur(6px)",
          zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "20px",
        }} onClick={() => setShowUpgradeModal(false)}>
          <div style={{
            background: "var(--bg-card)",
            borderRadius: "24px",
            padding: "40px",
            maxWidth: "440px",
            width: "100%",
            boxShadow: "0 40px 120px rgba(26,26,26,0.25)",
            border: "1px solid var(--border)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <div style={{
                width: "56px", height: "56px",
                borderRadius: "16px",
                background: "rgba(252,174,145,0.12)",
                border: "1.5px solid rgba(252,174,145,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px",
              }}>
                <ZapIcon />
              </div>
              <h2 style={{ fontSize: "22px", fontWeight: 800, color: "var(--onyx)", letterSpacing: "-0.5px", marginBottom: "8px" }}>
                Переход на {plans[selectedPlan].name}
              </h2>
              <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: "1.6" }}>
                Стоимость ₽{getPrice(selectedPlan, selectedPeriod).toLocaleString("ru-RU")}/мес.
                {selectedPeriod > 1 && ` Со скидкой ${periodDiscounts[selectedPeriod] * 100}% при оплате за ${selectedPeriod} мес.`}
              </p>
            </div>

            <div style={{
              padding: "16px 20px",
              background: "rgba(252,174,145,0.06)",
              borderRadius: "14px",
              marginBottom: "24px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", color: "var(--muted)" }}>Тариф</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>{plans[selectedPlan].name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", color: "var(--muted)" }}>Период</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>
                  {selectedPeriod === 1 ? "1 месяц" : `${selectedPeriod} месяцев`}
                </span>
              </div>
              {selectedPeriod > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", color: "var(--muted)" }}>Скидка</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--pistachio)" }}>
                    −{periodDiscounts[selectedPeriod] * 100}% (−₽{savedTotal.toLocaleString("ru-RU")})
                  </span>
                </div>
              )}
              <div style={{ height: "1px", background: "var(--border)", margin: "12px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--onyx)" }}>Итого</span>
                <span style={{ fontSize: "18px", fontWeight: 800, color: "var(--onyx)" }}>
                  ₽{totalToPay.toLocaleString("ru-RU")}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button style={{
                padding: "14px",
                borderRadius: "12px",
                border: "none",
                background: "var(--peach)",
                color: "white",
                fontSize: "15px", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 4px 20px rgba(252,174,145,0.35)",
                transition: "all 0.2s ease",
              }}>
                Подтвердить и оплатить
              </button>
              <button
                onClick={() => setShowUpgradeModal(false)}
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  border: "1.5px solid var(--border)",
                  background: "transparent",
                  color: "var(--muted)",
                  fontSize: "14px", fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.2s ease",
                }}
              >Отмена</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "16px" }}>
              <InfoIcon />
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                Защищено PCI DSS · Возврат в течение 7 дней
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: PAYMENT METHOD (Premium Interactive Morphing Checkout)
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "method" && (
        <div style={{ padding: "0 32px", animation: "fadeSlideIn 0.4s ease forwards" }}>
          {/* Вызываем нашу вынесенную наружу функцию */}
          <PaymentMethodSection triggerToast={(msg: string) => alert(msg)} />
        </div>
      )}

      {/* ─── UPGRADE MODAL ─── */}
      {showUpgradeModal && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(26,26,26,0.6)",
          backdropFilter: "blur(6px)",
          zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "20px",
        }} onClick={() => setShowUpgradeModal(false)}>
          <div style={{
            background: "var(--bg-card)",
            borderRadius: "24px",
            padding: "40px",
            maxWidth: "440px",
            width: "100%",
            boxShadow: "0 40px 120px rgba(26,26,26,0.25)",
            border: "1px solid var(--border)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <div style={{
                width: "56px", height: "56px",
                borderRadius: "16px",
                background: "rgba(252,174,145,0.12)",
                border: "1.5px solid rgba(252,174,145,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px",
              }}>
                <ZapIcon />
              </div>
              <h2 style={{ fontSize: "22px", fontWeight: 800, color: "var(--onyx)", letterSpacing: "-0.5px", marginBottom: "8px" }}>
                Переход на {plans[selectedPlan].name}
              </h2>
              <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: "1.6" }}>
                Стоимость ₽{getPrice(selectedPlan, selectedPeriod).toLocaleString("ru-RU")}/мес.
                {selectedPeriod > 1 && ` Со скидкой ${periodDiscounts[selectedPeriod] * 100}% при оплате за ${selectedPeriod} мес.`}
              </p>
            </div>

            <div style={{
              padding: "16px 20px",
              background: "rgba(252,174,145,0.06)",
              borderRadius: "14px",
              marginBottom: "24px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", color: "var(--muted)" }}>Тариф</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>{plans[selectedPlan].name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", color: "var(--muted)" }}>Период</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>
                  {selectedPeriod === 1 ? "1 месяц" : `${selectedPeriod} месяцев`}
                </span>
              </div>
              {selectedPeriod > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", color: "var(--muted)" }}>Скидка</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--pistachio)" }}>
                    −{periodDiscounts[selectedPeriod] * 100}% (−₽{savedTotal.toLocaleString("ru-RU")})
                  </span>
                </div>
              )}
              <div style={{ height: "1px", background: "var(--border)", margin: "12px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--onyx)" }}>Итого</span>
                <span style={{ fontSize: "18px", fontWeight: 800, color: "var(--onyx)" }}>
                  ₽{totalToPay.toLocaleString("ru-RU")}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button style={{
                padding: "14px",
                borderRadius: "12px",
                border: "none",
                background: "var(--peach)",
                color: "white",
                fontSize: "15px", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 4px 20px rgba(252,174,145,0.35)",
                transition: "all 0.2s ease",
              }}>
                Подтвердить и оплатить
              </button>
              <button
                onClick={() => setShowUpgradeModal(false)}
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  border: "1.5px solid var(--border)",
                  background: "transparent",
                  color: "var(--muted)",
                  fontSize: "14px", fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.2s ease",
                }}
              >Отмена</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "16px" }}>
              <InfoIcon />
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                Защищено PCI DSS · Возврат в течение 7 дней
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Keyframe styles */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
          .premium-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 8px;
          background: rgba(26,26,26,0.06);
          border-radius: 6px;
          outline: none;
          transition: background 0.2s;
        }
        .premium-slider:hover {
          background: rgba(26,26,26,0.1);
        }
        .premium-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: white;
          border: 2px solid var(--peach);
          cursor: grab;
          box-shadow: 0 4px 12px rgba(252,174,145,0.4), 0 1px 3px rgba(0,0,0,0.1);
          transition: transform 0.15s cubic-bezier(0.34, 1.5, 0.64, 1);
        }
        .premium-slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(1.15);
        }
          /* 🔥 СТИЛИ ДЛЯ ИНТЕРАКТИВНОГО ГРАФИКА 🔥 */
        .chart-bar-group {
          position: relative;
        }
        .chart-bar-group > .bar-fill {
          transition: all 0.2s cubic-bezier(0.34, 1.5, 0.64, 1);
          transform-origin: bottom;
        }
        .chart-bar-group:hover > .bar-fill {
          filter: brightness(0.85);
          transform: scaleY(1.03);
        }
        .chart-tooltip {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          background: #1A1A1A;
          color: white;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          visibility: hidden;
          transform: translate(-50%, 10px);
          transition: all 0.2s cubic-bezier(0.34, 1.5, 0.64, 1);
          z-index: 10;
          box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        }
        /* Треугольник под тултипом */
        .chart-tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border-width: 5px;
          border-style: solid;
          border-color: #1A1A1A transparent transparent transparent;
        }
        .chart-bar-group:hover .chart-tooltip {
          opacity: 1;
          visibility: visible;
          transform: translate(-50%, 0);
        }
        @keyframes cardLaserScan {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
      `}</style>
    </div>
  );
}

// ─── INTERACTIVE PAYMENT METHOD SECTION (VISUAL ORGASM EDITION) ────────────────
function PaymentMethodSection({ triggerToast }: { triggerToast: (msg: string) => void }) {
  const [isAddingCard, setIsAddingCard] = useState(false);
  
  // Живые стейты интерактивной карты
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length > 0 ? parts.join(' ') : value;
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/[^0-9]/g, '');
    if (v.length >= 2) {
      return `${v.slice(0, 2)}/${v.slice(2, 4)}`;
    }
    return v;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      
      {/* Главный контейнер-трансформер */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "32px", alignItems: "start" }}>
        
        {/* ЛЕВАЯ КОЛОНКА: ХАЙ-ЭНД БАНКОВСКАЯ КАРТА */}
        <div style={{
          width: "340px", height: "210px", borderRadius: "20px",
          background: "linear-gradient(135deg, #0f0f12 0%, #1b1b22 100%)",
          padding: "28px", boxSizing: "border-box", position: "relative",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          border: `1.5px solid ${focusedField ? "var(--peach)" : "rgba(255,255,255,0.06)"}`,
          boxShadow: focusedField 
            ? "0 30px 60px rgba(252,174,145,0.22), 0 0 20px rgba(252,174,145,0.1), inset 0 1px 1px rgba(255,255,255,0.1)" 
            : "0 24px 48px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.05)",
          transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          transform: focusedField ? "scale(1.02) translateY(-2px)" : "none",
          overflow: "hidden"
        }}>
          {/* Лазерная неоновая нить сканирования безопасности */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "20px",
            background: "linear-gradient(to right, transparent, rgba(252,174,145,0.04), transparent)",
            animation: "cardLaserScan 4s linear infinite", pointerEvents: "none"
          }} />

          {/* Верхний ряд карты */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative", zIndex: 2 }}>
            <div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "1px", fontWeight: 800 }}>
                {isAddingCard ? "РЕЖИМ ПРИВЯЗКИ" : "ОСНОВНАЯ КАРТА"}
              </div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "white", marginTop: "2px" }}>
                {isAddingCard ? "Новый метод" : "Visa Infinite"}
              </div>
            </div>
            {/* Нарядный монохромный чип */}
            <div style={{
              width: "36px", height: "26px", borderRadius: "6px",
              background: "linear-gradient(135deg, #e6c587 0%, #ba9958 100%)",
              position: "relative", display: "flex", padding: "6px", boxSizing: "border-box",
              opacity: 0.85, boxShadow: "0 2px 6px rgba(0,0,0,0.3)"
            }}>
              <div style={{ width: "100%", height: "100%", border: "0.5px solid rgba(0,0,0,0.2)", borderRadius: "3px" }} />
            </div>
          </div>

          {/* Живой роскошный номер карты */}
          <div style={{ 
            fontSize: "20px", fontWeight: 700, 
            fontFamily: "monospace", letterSpacing: "3px",
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            transition: "all 0.2s",
            color: focusedField === "number" ? "var(--peach)" : "white",
            position: "relative", zIndex: 2
          }}>
            {isAddingCard 
              ? (cardNumber || "•••• •••• •••• ••••")
              : "•••• •••• •••• 4821"
            }
          </div>

          {/* Нижний ряд карты */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", position: "relative", zIndex: 2 }}>
            <div style={{ transition: "all 0.2s", color: focusedField === "name" ? "var(--peach)" : "white", maxWidth: "180px", overflow: "hidden" }}>
              <div style={{ fontSize: "8px", fontWeight: 800, color: "rgba(255,255,255,0.3)", letterSpacing: "0.5px" }}>ДЕРЖАТЕЛЬ</div>
              <div style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", marginTop: "3px", letterSpacing: "0.5px", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                {isAddingCard ? (cardName || "CARDHOLDER NAME") : "IVAN PETROV"}
              </div>
            </div>
            <div style={{ display: "flex", gap: "24px" }}>
              <div style={{ transition: "all 0.2s", color: focusedField === "expiry" ? "var(--peach)" : "white", textAlign: "right" }}>
                <div style={{ fontSize: "8px", fontWeight: 800, color: "rgba(255,255,255,0.3)", letterSpacing: "0.5px" }}>СРОК</div>
                <div style={{ fontSize: "12px", fontWeight: 600, marginTop: "3px", fontFamily: "monospace" }}>
                  {isAddingCard ? (cardExpiry || "MM/YY") : "09/27"}
                </div>
              </div>
              <div style={{ transition: "all 0.2s", color: focusedField === "cvc" ? "var(--peach)" : "white", textAlign: "right" }}>
                <div style={{ fontSize: "8px", fontWeight: 800, color: "rgba(255,255,255,0.3)", letterSpacing: "0.5px" }}>CVC</div>
                <div style={{ fontSize: "12px", fontWeight: 600, marginTop: "3px", fontFamily: "monospace" }}>
                  {isAddingCard ? (cardCvc ? "•••" : "— — —") : "•••"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА: ИНТЕЛЛЕКТУАЛЬНЫЙ МОРФИНГ-ИНТЕРФЕЙС */}
        <div style={{ minWidth: 0, width: "100%" }}>
          
          {/* СТЕЙТ 1: ОБЫЧНЫЙ РЕЖИМ (ИНФОРМАЦИЯ О БЕЗОПАСНОСТИ + КНОПКА ПРИВЯЗКИ) */}
          {!isAddingCard ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", animation: "fadeSlideIn 0.3s ease" }}>
              <div style={{
                padding: "24px 28px", background: "var(--bg-card)",
                border: "1px solid var(--border)", borderRadius: "20px",
                boxShadow: "var(--shadow)", display: "flex", flexDirection: "column", gap: "14px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pistachio)" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--onyx)" }}>Стандарты защиты данных</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" }}>
                  {["Шифрование по протоколу PCI DSS Level 1", "Защита транзакций через 3D Secure", "Данные карт не оседают на серверах", "Автоматические уведомления за 3 дня"].map((text, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--muted)" }}>
                      <span style={{ color: "var(--pistachio)", fontWeight: "bold" }}>✓</span> {text}
                    </div>
                  ))}
                </div>
              </div>

              {/* РОСКОШНАЯ КНОПКА ЗАМЕНЫ / ПРИВЯЗКИ */}
              <button 
                onClick={() => setIsAddingCard(true)}
                style={{
                  width: "100%", padding: "16px", borderRadius: "14px",
                  background: "#FFFFFF", color: "var(--onyx)",
                  border: "1px solid rgba(26,26,26,0.12)",
                  fontSize: "13.5px", fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  transition: "all 0.25s cubic-bezier(0.34, 1.5, 0.64, 1)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.02)"
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.borderColor = "var(--peach)";
                  e.currentTarget.style.color = "var(--peach)";
                  e.currentTarget.style.boxShadow = "0 12px 24px rgba(252,174,145,0.12)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.borderColor = "rgba(26,26,26,0.12)";
                  e.currentTarget.style.color = "var(--onyx)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.02)";
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                Привязать новую банковскую карту
              </button>
            </div>
          ) : (
            
            // 🔥 ВОТ ЗДЕСЬ БЫЛ БАГ (Заменил фигурные скобки на обычный JS комментарий)
            // СТЕЙТ 2: РОСКОШНАЯ ИНЛАЙН-ФОРМА ВВОДА РЕКВИЗИТОВ
            <div style={{
              padding: "28px 32px", background: "#FFFFFF",
              border: "1.5px solid var(--peach)", borderRadius: "20px",
              boxShadow: "0 16px 40px rgba(252,174,145,0.08)",
              display: "flex", flexDirection: "column", gap: "20px",
              animation: "fadeSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards"
            }}>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--onyx)", letterSpacing: "-0.2px" }}>Новые платежные реквизиты</div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                
                <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--muted)" }}>Номер карты</label>
                  <input 
                    type="text" placeholder="4242 4242 4242 4242" value={cardNumber}
                    maxLength={19}
                    onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                    onFocus={() => setFocusedField("number")} onBlur={() => setFocusedField(null)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--border)", outline: "none", fontSize: "13.5px", transition: "all 0.2s", background: focusedField === "number" ? "rgba(252,174,145,0.02)" : "#FFF", borderColor: focusedField === "number" ? "var(--peach)" : "var(--border)" }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--muted)" }}>Имя держателя (Латиница)</label>
                  <input 
                    type="text" placeholder="ALEXEY MOROZOV" value={cardName}
                    onChange={e => setCardName(e.target.value.toUpperCase().replace(/[^A-Z\s]/g, ""))}
                    onFocus={() => setFocusedField("name")} onBlur={() => setFocusedField(null)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--border)", outline: "none", fontSize: "13.5px", transition: "all 0.2s", background: focusedField === "name" ? "rgba(252,174,145,0.02)" : "#FFF", borderColor: focusedField === "name" ? "var(--peach)" : "var(--border)" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--muted)" }}>Срок действия</label>
                  <input 
                    type="text" placeholder="MM/YY" value={cardExpiry} maxLength={5}
                    onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                    onFocus={() => setFocusedField("expiry")} onBlur={() => setFocusedField(null)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--border)", outline: "none", fontSize: "13.5px", transition: "all 0.2s", background: focusedField === "expiry" ? "rgba(252,174,145,0.02)" : "#FFF", borderColor: focusedField === "expiry" ? "var(--peach)" : "var(--border)" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--muted)" }}>CVC код</label>
                  <input 
                    type="password" placeholder="•••" value={cardCvc} maxLength={3}
                    onChange={e => setCardCvc(e.target.value.replace(/[^0-9]/g, ""))}
                    onFocus={() => setFocusedField("cvc")} onBlur={() => setFocusedField(null)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1.5px solid var(--border)", outline: "none", fontSize: "13.5px", transition: "all 0.2s", background: focusedField === "cvc" ? "rgba(252,174,145,0.02)" : "#FFF", borderColor: focusedField === "cvc" ? "var(--peach)" : "var(--border)" }}
                  />
                </div>

              </div>

              {/* Экшен-кнопки управления формой */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button 
                  onClick={() => { setIsAddingCard(false); setCardNumber(""); setCardName(""); setCardExpiry(""); setCardCvc(""); }} 
                  className="topbar-ghost" style={{ padding: "10px 18px", fontSize: "12.5px" }}
                >
                  Отмена
                </button>
                <button 
                  onClick={() => {
                    if (cardNumber.length < 15) return;
                    setIsAddingCard(false);
                    triggerToast("Новая Visa Infinite успешно привязана в качестве основной 🎉");
                    setCardNumber(""); setCardName(""); setCardExpiry(""); setCardCvc("");
                  }} 
                  style={{
                    padding: "10px 22px", borderRadius: "10px",
                    background: "var(--peach)", border: "none", color: "white",
                    fontSize: "12.5px", fontWeight: 700, cursor: "pointer",
                    boxShadow: "0 6px 20px rgba(252,174,145,0.3)"
                  }}
                >
                  Сохранить карту
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* НИЖНИЙ БЛОК: НАСТРОЙКИ АВТОПЛАТЕЖА */}
      <div style={{
        marginTop: "12px", padding: "24px 28px",
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "20px", boxShadow: "var(--shadow)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M11 2L3 11H10L9 18L17 9H10L11 2Z" fill="var(--peach)" fillOpacity="0.2" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)" }}>Настройки автоплатежа</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
          {[
            { label: "Автоматическое продление", desc: "Списание происходит без подтверждения", active: true },
            { label: "Email-уведомления", desc: "Чек на почту после каждого платежа", active: true },
            { label: "Уведомить за 3 дня", desc: "Напомним перед автоматическим списанием", active: true },
            { label: "SMS-оповещение", desc: "Сообщение на номер при списании", active: false },
          ].map((setting, i) => (
            <div key={i} style={{ padding: "16px 18px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)", marginBottom: "2px" }}>{setting.label}</div>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>{setting.desc}</div>
              </div>
              <div style={{
                width: "38px", height: "22px", borderRadius: "11px",
                background: setting.active ? "var(--peach)" : "var(--border)",
                position: "relative", cursor: "pointer", flexShrink: 0,
                transition: "background 0.2s ease",
                boxShadow: setting.active ? "0 2px 10px rgba(252,174,145,0.3)" : "none",
              }}>
                <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "white", position: "absolute", top: "3px", left: setting.active ? "19px" : "3px", transition: "left 0.2s ease", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}