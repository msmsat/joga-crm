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
            {billingMode === "percent" && (
              <div style={{
                marginTop: "20px", padding: "20px",
                background: "rgba(252,174,145,0.05)",
                borderRadius: "14px", border: "1px solid rgba(252,174,145,0.15)",
              }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)", marginBottom: "14px" }}>
                  Выберите процент с каждого онлайн-платежа
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {[2, 3, 5, 7, 8].map(p => (
                    <button
                      key={p}
                      onClick={() => setPercentAmount(p)}
                      style={{
                        padding: "10px 20px",
                        borderRadius: "10px",
                        border: `1.5px solid ${percentAmount === p ? "var(--peach)" : "var(--border)"}`,
                        background: percentAmount === p ? "var(--peach)" : "transparent",
                        color: percentAmount === p ? "white" : "var(--onyx)",
                        fontSize: "14px", fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                        transition: "all 0.2s ease",
                      }}
                    >{p}%</button>
                  ))}
                </div>
                <div style={{
                  marginTop: "14px", padding: "12px 16px",
                  background: "rgba(163,201,168,0.12)",
                  borderRadius: "10px",
                  fontSize: "12px", color: "var(--muted)",
                }}>
                  При {percentAmount}% и обороте <strong style={{ color: "var(--onyx)" }}>₽100 000</strong> в месяц
                  вы платите <strong style={{ color: "var(--pistachio)" }}>₽{(100000 * percentAmount / 100).toLocaleString("ru-RU")}</strong>
                </div>
              </div>
            )}

            {billingMode === "fixed" && (
              <div style={{
                marginTop: "20px", padding: "20px",
                background: "rgba(252,174,145,0.05)",
                borderRadius: "14px", border: "1px solid rgba(252,174,145,0.15)",
              }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)", marginBottom: "14px" }}>
                  Фиксированная часть + 3% с платежей
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {[990, 1490, 1990].map(a => (
                    <button
                      key={a}
                      onClick={() => setFixedAmount(a)}
                      style={{
                        padding: "10px 20px",
                        borderRadius: "10px",
                        border: `1.5px solid ${fixedAmount === a ? "var(--peach)" : "var(--border)"}`,
                        background: fixedAmount === a ? "var(--peach)" : "transparent",
                        color: fixedAmount === a ? "white" : "var(--onyx)",
                        fontSize: "14px", fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                        transition: "all 0.2s ease",
                      }}
                    >₽{a.toLocaleString("ru-RU")}</button>
                  ))}
                </div>
                <div style={{
                  marginTop: "14px", padding: "12px 16px",
                  background: "rgba(163,201,168,0.12)",
                  borderRadius: "10px",
                  fontSize: "12px", color: "var(--muted)",
                }}>
                  ₽{fixedAmount.toLocaleString("ru-RU")}/мес + 3% от транзакций — лучший вариант при обороте от ₽50 000
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
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px", marginBottom: "20px",
          }}>
            {(["start", "pro", "business"] as const).map((planId, i) => {
              const plan = plans[planId];
              const features = planFeatures[planId];
              const price = billingMode === "subscription" ? getPrice(planId, selectedPeriod) : plan.monthly;
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

                  {billingMode === "subscription" && selectedPeriod > 1 && (
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

          {/* Spend summary */}
          <div style={{
            padding: "28px 32px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            boxShadow: "var(--shadow)",
            marginBottom: "20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <TrendingIcon />
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)" }}>
                Динамика расходов
              </span>
            </div>

            {/* Simple bar chart */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "80px" }}>
              {[990, 2490, 2490, 2490, 2490, 2490].map((val, i) => {
                const max = 2490;
                const height = (val / max) * 70;
                const months = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн"];
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                    <div style={{
                      width: "100%", height: `${height}px`,
                      background: i === 5
                        ? "linear-gradient(180deg, var(--peach), #F9A08B)"
                        : "rgba(252,174,145,0.2)",
                      borderRadius: "6px 6px 0 0",
                      transition: "all 0.3s ease",
                      boxShadow: i === 5 ? "0 4px 16px rgba(252,174,145,0.3)" : "none",
                    }} />
                    <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600 }}>{months[i]}</div>
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
          TAB: PAYMENT METHOD
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "method" && (
        <div style={{ padding: "0 32px" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}>
            {/* Current card */}
            <div style={{
              padding: "28px",
              background: "linear-gradient(135deg, var(--onyx) 0%, #2A2A2A 100%)",
              borderRadius: "20px",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: "-30%", right: "-10%",
                width: "200px", height: "200px",
                background: "radial-gradient(circle, rgba(252,174,145,0.15) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />

              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", letterSpacing: "1px", marginBottom: "4px" }}>
                      ТЕКУЩАЯ КАРТА
                    </div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "white" }}>
                      Основной метод
                    </div>
                  </div>
                  <div style={{
                    padding: "4px 10px",
                    background: "rgba(163,201,168,0.2)",
                    border: "1px solid rgba(163,201,168,0.3)",
                    borderRadius: "100px",
                    fontSize: "11px", fontWeight: 700, color: "#A3C9A8",
                  }}>Активна</div>
                </div>

                {/* Card number */}
                <div style={{
                  fontSize: "22px", fontWeight: 700, color: "white",
                  letterSpacing: "4px", marginBottom: "24px", fontFamily: "monospace",
                }}>
                  •••• •••• •••• 4821
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "2px" }}>ВЛАДЕЛЕЦ</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "white" }}>IVAN PETROV</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "2px" }}>ИСТЕКАЕТ</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "white" }}>09 / 27</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "2px" }}>СИСТЕМА</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "white" }}>Visa</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Add / manage */}
            <div style={{
              display: "flex", flexDirection: "column", gap: "12px",
            }}>
              <div style={{
                padding: "24px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "20px",
                boxShadow: "var(--shadow)",
                flex: 1,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                  <ShieldIcon />
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--onyx)" }}>
                    Безопасность платежей
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {[
                    "Данные карты не хранятся на наших серверах",
                    "Шифрование PCI DSS Level 1",
                    "3D Secure на каждой транзакции",
                    "Автосписание с уведомлением за 3 дня",
                  ].map((text, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                      <CheckIcon size={16} color="var(--pistachio)" />
                      <span style={{ fontSize: "13px", color: "var(--muted)", lineHeight: "1.4" }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button style={{
                padding: "14px 20px",
                borderRadius: "14px",
                border: "2px dashed var(--border)",
                background: "transparent",
                color: "var(--muted)",
                fontSize: "13px", fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                transition: "all 0.2s ease",
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--peach)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--peach)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)";
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                Добавить новую карту
              </button>
            </div>
          </div>

          {/* Autopay settings */}
          <div style={{
            marginTop: "16px",
            padding: "24px 28px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            boxShadow: "var(--shadow)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <ZapIcon />
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)" }}>
                Настройки автоплатежа
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
              {[
                { label: "Автоматическое продление", desc: "Списание происходит без подтверждения", active: true },
                { label: "Email-уведомления", desc: "Чек на почту после каждого платежа", active: true },
                { label: "Уведомить за 3 дня", desc: "Напомним перед автоматическим списанием", active: true },
                { label: "SMS-оповещение", desc: "Сообщение на номер при списании", active: false },
              ].map((setting, i) => (
                <div key={i} style={{
                  padding: "16px 18px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)", marginBottom: "2px" }}>
                      {setting.label}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--muted)" }}>{setting.desc}</div>
                  </div>
                  <div style={{
                    width: "38px", height: "22px",
                    borderRadius: "11px",
                    background: setting.active ? "var(--peach)" : "var(--border)",
                    position: "relative",
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "background 0.2s ease",
                    boxShadow: setting.active ? "0 2px 10px rgba(252,174,145,0.3)" : "none",
                  }}>
                    <div style={{
                      width: "16px", height: "16px",
                      borderRadius: "50%",
                      background: "white",
                      position: "absolute",
                      top: "3px",
                      left: setting.active ? "19px" : "3px",
                      transition: "left 0.2s ease",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
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
      `}</style>
    </div>
  );
}