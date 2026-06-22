import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import InputRow from "../ui/form/InputRow";
import type { useBilling } from "../../hooks/useBilling";

type BillingState = ReturnType<typeof useBilling>;

interface BillingTabProps extends BillingState {
  savedStates: Record<string, boolean>;
  triggerSave: (key: string, msg: string) => void;
}

export default function BillingTab({
  billingView, setBillingView,
  isAddingCard, setIsAddingCard,
  isManagingSub, setIsManagingSub,
  billingCycle, setBillingCycle,
  cardNumber, setCardNumber,
  cardName, setCardName,
  cardExpiry, setCardExpiry,
  cardCvc, setCardCvc,
  cardFocused, setCardFocused: _setCardFocused,
  addCard, replaceCard, applyBillingSettings, upgradeToBusinessView,
  triggerToast,
  savedStates: _savedStates,
}: BillingTabProps) {
  const sectionIcons = {
    card: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="3" ry="3"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    plus: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
    arrowLeft: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
    shieldCheck: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 11 11 13 15 9"/></svg>,
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length > 0) return parts.join(' ');
    return value;
  };

  if (billingView === "tariffs") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeSlideIn 0.3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => setBillingView("dashboard")}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "50%", background: "#FFFFFF", border: "1px solid rgba(26,26,26,0.08)", cursor: "pointer", color: "var(--onyx)", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--peach)"; e.currentTarget.style.color = "var(--peach)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(26,26,26,0.08)"; e.currentTarget.style.color = "var(--onyx)"; }}
          >
            {sectionIcons.arrowLeft}
          </button>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--muted)" }}>Назад в управление подпиской</span>
        </div>

        <div style={{ textAlign: "center", margin: "10px 0 20px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 900, color: "var(--onyx)", marginBottom: "8px", letterSpacing: "-0.5px" }}>Доступные тарифные планы</h1>
          <p style={{ fontSize: "13px", color: "var(--muted)" }}>Перейдите на Business уровень, чтобы масштабировать ваш бренд без ограничений</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <div style={{ padding: "32px", borderRadius: "16px", background: "#FFFFFF", border: "1px solid var(--border)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--onyx)", marginBottom: "6px" }}>Pro Лицензия</div>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "20px" }}>Идеально для растущих студий и премиум-бутиков</div>
              <div style={{ fontSize: "32px", fontWeight: 950, color: "var(--onyx)", marginBottom: "24px" }}>4 990 ₽ <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--muted)" }}>/ мес</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {["До 5 активных сотрудников", "До 3 залов синхронизации", "База клиентов без лимитов", "Стандартная аналитика"].map((f, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--onyx)", fontWeight: 500 }}>
                    <span style={{ color: "#A3C9A8" }}>✓</span> {f}
                  </div>
                ))}
              </div>
            </div>
            <button disabled style={{ width: "100%", padding: "12px", borderRadius: "10px", background: "rgba(26,26,26,0.04)", border: "none", color: "var(--muted)", fontSize: "13px", fontWeight: 700, marginTop: "40px" }}>Ваш текущий тариф</button>
          </div>

          <div style={{ padding: "32px", borderRadius: "16px", background: "linear-gradient(135deg, #121212 0%, #1e1e24 100%)", border: "2px solid var(--peach)", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 20px 40px rgba(252,174,145,0.15)", position: "relative" }}>
            <span style={{ position: "absolute", top: "16px", right: "16px", background: "var(--peach)", color: "white", padding: "4px 10px", borderRadius: "100px", fontSize: "10px", fontWeight: 800, letterSpacing: "0.5px" }}>РЕКОМЕНДУЕМ</span>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "white", marginBottom: "6px" }}>Business План</div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "20px" }}>Максимальная экосистема для крупных сетей и франшиз</div>
              <div style={{ fontSize: "32px", fontWeight: 950, color: "white", marginBottom: "24px" }}>9 990 ₽ <span style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255,255,255,0.4)" }}>/ мес</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {["Безлимитное число сотрудников", "Франшизная мульти-сеть (все филиалы)", "Глубокая финансовая AI-аналитика", "Персональный менеджер 24/7", "Кастомное брендирование виджетов"].map((f, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>
                    <span style={{ color: "var(--peach)" }}>✓</span> {f}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={upgradeToBusinessView}
              style={{ width: "100%", padding: "12px", borderRadius: "10px", background: "var(--peach)", border: "none", color: "white", fontSize: "13px", fontWeight: 700, cursor: "pointer", marginTop: "40px", boxShadow: "0 4px 16px rgba(252,174,145,0.4)", transition: "transform 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              Перейти на Business
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{
        borderRadius: "16px", padding: "32px 40px",
        background: "linear-gradient(135deg, #16161a 0%, #222226 100%)",
        border: "1px solid rgba(255,255,255,0.05)",
        position: "relative", overflow: "hidden",
        boxShadow: "0 20px 40px rgba(0,0,0,0.12)"
      }}>
        <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "200px", height: "200px", background: "radial-gradient(circle, rgba(252,174,145,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: "10.5px", fontWeight: 800, color: "rgba(252,174,145,0.85)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>
            Ваш план обслуживания
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "24px" }}>
            <div style={{ fontSize: "32px", fontWeight: 900, color: "white", letterSpacing: "-1px" }}>Pro Тариф</div>
            <span style={{ padding: "4px 12px", borderRadius: "100px", fontSize: "11px", fontWeight: 700, background: "rgba(163,201,168,0.15)", color: "#A3C9A8", border: "1px solid rgba(163,201,168,0.25)" }}>Активен до 15 июля</span>
          </div>
          <div style={{ display: "flex", gap: "48px", marginBottom: "28px" }}>
            {[
              { v: "БЕЗЛИМИТНО", l: "База клиентов", desc: "Без скрытых ограничений" },
              { v: "5 из 5 мест", l: "Сотрудники студии", desc: "Доступно расширение" },
              { v: "АКТИВЕН", l: "Полный API доступ", desc: "Синхронизация включена" }
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "white", letterSpacing: "-0.2px" }}>{s.v}</div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "2px" }}>{s.l}</div>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>{s.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => setBillingView("tariffs")}
              style={{ padding: "10px 22px", borderRadius: "10px", background: "var(--peach)", border: "none", color: "white", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.25s cubic-bezier(0.34, 1.5, 0.64, 1)", boxShadow: "0 4px 16px rgba(252,174,145,0.3)" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1.5px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(252,174,145,0.45)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(252,174,145,0.3)"; }}
              onMouseDown={e => e.currentTarget.style.transform = "scale(0.96)"}
              onMouseUp={e => e.currentTarget.style.transform = "translateY(-1.5px)"}
            >
              Улучшить до Business
            </button>
            <button
              onClick={() => setIsManagingSub(!isManagingSub)}
              style={{ padding: "10px 22px", borderRadius: "10px", background: isManagingSub ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)", border: isManagingSub ? "1px solid var(--peach)" : "1px solid rgba(255,255,255,0.12)", color: isManagingSub ? "var(--peach)" : "rgba(255,255,255,0.75)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
              onMouseEnter={e => { if (!isManagingSub) { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#FFFFFF"; } }}
              onMouseLeave={e => { if (!isManagingSub) { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; } }}
            >
              {isManagingSub ? "Закрыть управление" : "Управление подпиской"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateRows: isManagingSub ? "1fr" : "0fr", transition: "grid-template-rows 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)" }}>
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          <div style={{ padding: "24px", borderRadius: "14px", background: "#FFFFFF", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--onyx)" }}>Период оплаты лицензии</div>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>Переключитесь на годовой цикл для экономии бюджета</div>
              </div>
              <div style={{ display: "flex", gap: "4px", background: "rgba(26,26,26,0.03)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border)" }}>
                <button onClick={() => setBillingCycle("monthly")} style={{ padding: "6px 12px", borderRadius: "7px", border: "none", background: billingCycle === "monthly" ? "#FFFFFF" : "transparent", fontSize: "11px", fontWeight: 700, color: billingCycle === "monthly" ? "var(--onyx)" : "var(--muted)", cursor: "pointer", transition: "all 0.2s", boxShadow: billingCycle === "monthly" ? "0 2px 6px rgba(0,0,0,0.05)" : "none" }}>Ежемесячно</button>
                <button onClick={() => setBillingCycle("yearly")} style={{ padding: "6px 12px", borderRadius: "7px", border: "none", background: billingCycle === "yearly" ? "var(--peach)" : "transparent", fontSize: "11px", fontWeight: 700, color: billingCycle === "yearly" ? "#FFFFFF" : "var(--muted)", cursor: "pointer", transition: "all 0.2s", boxShadow: billingCycle === "yearly" ? "0 4px 10px rgba(252,174,145,0.3)" : "none" }}>Ежегодно -30%</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button onClick={applyBillingSettings} style={{ padding: "8px 16px", borderRadius: "8px", background: "rgba(26,26,26,0.05)", border: "none", color: "var(--onyx)", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Применить настройки</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(252,174,145,0.12)", color: "var(--peach)", display: "flex", alignItems: "center", justifyContent: "center" }}>{sectionIcons.card}</div>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)" }}>Способ оплаты</div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>Управление картами автопродления</div>
            </div>
          </div>
          <button
            onClick={() => setIsAddingCard(!isAddingCard)}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "9px", background: isAddingCard ? "var(--peach)" : "rgba(252,174,145,0.08)", border: isAddingCard ? "1px solid var(--peach)" : "1px solid rgba(252,174,145,0.2)", color: isAddingCard ? "white" : "var(--peach)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.25s cubic-bezier(0.34, 1.5, 0.64, 1)", boxShadow: isAddingCard ? "0 4px 12px rgba(252,174,145,0.35)" : "none" }}
            onMouseEnter={e => { if (!isAddingCard) { e.currentTarget.style.background = "var(--peach)"; e.currentTarget.style.color = "white"; } }}
            onMouseLeave={e => { if (!isAddingCard) { e.currentTarget.style.background = "rgba(252,174,145,0.08)"; e.currentTarget.style.color = "var(--peach)"; } }}
          >
            {sectionIcons.plus}
            {isAddingCard ? "Закрыть форму" : "Добавить карту"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateRows: isAddingCard ? "1fr" : "0fr", transition: "grid-template-rows 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ minHeight: 0, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "32px", padding: "12px 4px 32px", alignItems: "center" }}>
              <div style={{
                width: "240px", height: "150px", borderRadius: "14px",
                background: "linear-gradient(135deg, #111111 0%, #1e1e24 100%)",
                padding: "20px", boxSizing: "border-box", position: "relative",
                display: "flex", flexDirection: "column", justifyContent: "space-between",
                boxShadow: "0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
                transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)",
                transform: cardFocused ? "scale(1.03) translateY(-2px)" : "scale(1)",
              }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: "14px", background: "linear-gradient(to right, transparent, rgba(252,174,145,0.03), transparent)", animation: "cardLaserScan 3s linear infinite", pointerEvents: "none" }} />
                <style>{`@keyframes cardLaserScan { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <svg width="28" height="22" viewBox="0 0 24 18" fill="none">
                    <rect width="24" height="18" rx="4" fill="#E8C97A" fillOpacity="0.85"/>
                    <path d="M0 6h24M0 12h24M8 0v18M16 0v18" stroke="#111111" strokeWidth="0.5" strokeOpacity="0.2"/>
                  </svg>
                  <span style={{ fontSize: "10px", fontWeight: 900, color: "white", letterSpacing: "1px" }}>VISA</span>
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, fontFamily: "monospace", letterSpacing: "1.5px", textShadow: "0 2px 4px rgba(0,0,0,0.5)", transition: "color 0.2s", color: cardFocused === "number" ? "var(--peach)" : "white" }}>
                  {cardNumber || "•••• •••• •••• ••••"}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
                  <div style={{ transition: "color 0.2s", color: cardFocused === "name" ? "var(--peach)" : "rgba(255,255,255,0.6)" }}>
                    <div style={{ fontSize: "7px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "rgba(255,255,255,0.3)" }}>Держатель</div>
                    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "130px" }}>{cardName || "CARDHOLDER NAME"}</div>
                  </div>
                  <div style={{ transition: "color 0.2s", color: cardFocused === "expiry" ? "var(--peach)" : "rgba(255,255,255,0.6)", textAlign: "right" }}>
                    <div style={{ fontSize: "7px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "rgba(255,255,255,0.3)" }}>Срок</div>
                    <div style={{ fontSize: "10px", fontWeight: 700, marginTop: "2px" }}>{cardExpiry || "MM/YY"}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <InputRow label="Номер карты" placeholder="4242 4242 4242 4242" value={cardNumber} onChange={v => setCardNumber(formatCardNumber(v))} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <InputRow label="Имя держателя (LATIN)" placeholder="ALEXEY MOROZOV" value={cardName} onChange={setCardName} />
                </div>
                <InputRow
                  label="Срок действия" placeholder="MM/YY" value={cardExpiry}
                  onChange={v => {
                    const sanitized = v.replace(/[^0-9]/g, '');
                    if (sanitized.length >= 2) setCardExpiry(`${sanitized.slice(0, 2)}/${sanitized.slice(2, 4)}`);
                    else setCardExpiry(sanitized);
                  }}
                />
                <InputRow label="CVC код" placeholder="•••" type="password" value={cardCvc} onChange={v => setCardCvc(v.slice(0, 3).replace(/[^0-9]/g, ''))} />
                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "6px" }}>
                  <button onClick={() => setIsAddingCard(false)} className="topbar-ghost" style={{ padding: "8px 16px", fontSize: "12px" }}>Отмена</button>
                  <button onClick={addCard} style={{ padding: "9px 20px", borderRadius: "8px", background: "var(--peach)", border: "none", color: "white", fontSize: "12px", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(252,174,145,0.3)" }}>
                    Привязать карту
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderRadius: "14px", background: "#FDFCFB", border: "1.5px solid rgba(26,26,26,0.06)", boxShadow: "0 4px 12px rgba(0,0,0,0.015)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <div style={{ width: "50px", height: "34px", borderRadius: "8px", background: "linear-gradient(135deg, #111111 0%, #2c2c30 100%)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "8px 10px", boxSizing: "border-box", flexShrink: 0, boxShadow: "0 4px 10px rgba(0,0,0,0.15)" }}>
              <div style={{ width: "10px", height: "8px", borderRadius: "2px", background: "rgba(252,174,145,0.4)" }} />
              <div style={{ fontSize: "7px", fontWeight: 900, color: "white", textAlign: "right", letterSpacing: "0.5px" }}>VISA</div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--onyx)", fontFamily: "monospace", letterSpacing: "1px" }}>•••• •••• •••• 4242</div>
                <span style={{ padding: "2px 8px", borderRadius: "100px", fontSize: "10px", fontWeight: 800, background: "rgba(252,174,145,0.12)", color: "var(--peach)" }}>Основная</span>
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "3px" }}>Visa Debit · Срок действия до 08/2027</div>
            </div>
          </div>
          <button
            onClick={replaceCard}
            style={{ display: "flex", alignItems: "center", gap: "5px", padding: "7px 14px", background: "#FFFFFF", color: "var(--onyx)", border: "1px solid rgba(26,26,26,0.1)", borderRadius: "8px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)"; e.currentTarget.style.borderColor = "var(--peach)"; e.currentTarget.style.color = "var(--peach)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.02)"; e.currentTarget.style.borderColor = "rgba(26,26,26,0.1)"; e.currentTarget.style.color = "var(--onyx)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            Заменить карту
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.download} title="История платежей" subtitle="Все транзакции и инвойсы" />
        {[
          { date: "15 июня 2026", amount: "4 990 ₽", plan: "Pro — июль", status: "active" as const },
          { date: "15 мая 2026", amount: "4 990 ₽", plan: "Pro — июнь", status: "active" as const },
          { date: "15 апреля 2026", amount: "4 990 ₽", plan: "Pro — май", status: "active" as const },
        ].map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 16px", borderRadius: "10px", marginBottom: "4px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{p.plan}</div>
              <div style={{ fontSize: "11px", color: "var(--muted)" }}>{p.date}</div>
            </div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--onyx)", marginRight: "8px" }}>{p.amount}</div>
            <StatusBadge type={p.status}>Оплачено</StatusBadge>
            <button
              onClick={() => triggerToast(`Скачивание чека за ${p.date.split(' ')[1]}...`)}
              style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", fontSize: "11px", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--peach)"; e.currentTarget.style.color = "var(--peach)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
            >
              {icons.download} PDF
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
