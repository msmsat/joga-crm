import { useState, useEffect, useRef } from "react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const tokens = {
  peach: "#F9A08B",
  peachLight: "#FCAE91",
  peachGlow: "rgba(249,160,139,0.18)",
  bg: "#FDFCFB",
  bgCard: "#FFFFFF",
  onyx: "#1A1A1A",
  muted: "#666666",
  border: "rgba(26,26,26,0.08)",
  pistachio: "#A3C9A8",
  rose: "#D88C9A",
  shadow: "0 8px 40px -8px rgba(26,26,26,0.10)",
  shadowHover: "0 20px 60px -12px rgba(249,160,139,0.22)",
};

// ─── FLOATING ORBS (background atmosphere) ───────────────────────────────────
function Orbs() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {/* Large warm orb top-right */}
      <div style={{
        position: "absolute", top: "-120px", right: "-80px",
        width: "640px", height: "640px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(249,160,139,0.13) 0%, transparent 70%)",
        animation: "float1 14s ease-in-out infinite",
      }} />
      {/* Soft orb bottom-left */}
      <div style={{
        position: "absolute", bottom: "5%", left: "-160px",
        width: "500px", height: "500px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(163,201,168,0.10) 0%, transparent 70%)",
        animation: "float2 18s ease-in-out infinite",
      }} />
      {/* Tiny accent orb center */}
      <div style={{
        position: "absolute", top: "38%", left: "45%",
        width: "320px", height: "320px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(249,160,139,0.07) 0%, transparent 60%)",
        animation: "float3 22s ease-in-out infinite",
      }} />
      <style>{`
        @keyframes float1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-40px,30px) scale(1.04)} }
        @keyframes float2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,-40px) scale(1.06)} }
        @keyframes float3 { 0%,100%{transform:translate(0,0)} 33%{transform:translate(-20px,20px)} 66%{transform:translate(20px,-15px)} }
      `}</style>
    </div>
  );
}

// ─── LOGO ─────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      {/* Logomark */}
      <div style={{
        width: "36px", height: "36px", borderRadius: "10px",
        background: `linear-gradient(135deg, ${tokens.peachLight} 0%, ${tokens.peach} 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 4px 14px ${tokens.peachGlow}`,
      }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="3" width="6" height="6" rx="2" fill="white" opacity="0.95"/>
          <rect x="11" y="3" width="6" height="6" rx="2" fill="white" opacity="0.6"/>
          <rect x="3" y="11" width="6" height="6" rx="2" fill="white" opacity="0.6"/>
          <rect x="11" y="11" width="6" height="6" rx="2" fill="white" opacity="0.95"/>
        </svg>
      </div>
      <span style={{
        fontFamily: "'Manrope', sans-serif",
        fontWeight: 800, fontSize: "19px",
        letterSpacing: "-0.4px", color: tokens.onyx,
      }}>
        Velora<span style={{ color: tokens.peach }}>.</span>
      </span>
    </div>
  );
}

// ─── NAV PILL ─────────────────────────────────────────────────────────────────
function NavLink({ children }: { children: string }) {
  const [hov, setHov] = useState(false);
  return (
    <a
      href="#"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: "'Manrope', sans-serif",
        fontSize: "14px", fontWeight: 500,
        color: hov ? tokens.onyx : tokens.muted,
        textDecoration: "none",
        transition: "color 0.2s",
        position: "relative",
      }}
    >
      {children}
      <span style={{
        position: "absolute", bottom: "-3px", left: "0", right: "0",
        height: "1.5px", background: tokens.peach, borderRadius: "2px",
        opacity: hov ? 1 : 0, transition: "opacity 0.2s",
      }} />
    </a>
  );
}

// ─── BADGE ────────────────────────────────────────────────────────────────────
function Badge({ children }: { children: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      padding: "5px 12px",
      background: `linear-gradient(135deg, rgba(249,160,139,0.12), rgba(249,160,139,0.06))`,
      border: `1px solid rgba(249,160,139,0.28)`,
      borderRadius: "100px",
      fontFamily: "'Manrope', sans-serif",
      fontSize: "12px", fontWeight: 600,
      color: tokens.peach,
      letterSpacing: "0.3px",
    }}>
      <span style={{
        width: "6px", height: "6px", borderRadius: "50%",
        background: tokens.peach,
        boxShadow: `0 0 0 3px ${tokens.peachGlow}`,
        animation: "pulse 2.4s ease-in-out infinite",
      }} />
      {children}
      <style>{`@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 3px rgba(249,160,139,0.18)}50%{opacity:.8;box-shadow:0 0 0 6px rgba(249,160,139,0.06)}}`}</style>
    </span>
  );
}

// ─── PRIMARY BUTTON ───────────────────────────────────────────────────────────
function PrimaryBtn({ children, large }: { children: string; large?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: large ? "16px 36px" : "12px 26px",
        background: hov
          ? `linear-gradient(135deg, #FCAE91 0%, #F9A08B 100%)`
          : `linear-gradient(135deg, ${tokens.peach} 0%, #F5866E 100%)`,
        border: "none", borderRadius: "10px",
        fontFamily: "'Manrope', sans-serif",
        fontWeight: 700,
        fontSize: large ? "16px" : "14px",
        color: "#fff",
        cursor: "pointer",
        boxShadow: hov
          ? `0 12px 40px -8px rgba(249,160,139,0.52), 0 2px 8px rgba(249,160,139,0.2)`
          : `0 4px 20px -4px rgba(249,160,139,0.38)`,
        transform: hov ? "translateY(-2px) scale(1.01)" : "none",
        transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        letterSpacing: "0.1px",
      }}
    >
      {children}
    </button>
  );
}

// ─── GHOST BUTTON ─────────────────────────────────────────────────────────────
function GhostBtn({ children, large }: { children: string; large?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: large ? "15px 36px" : "11px 26px",
        background: hov ? "rgba(249,160,139,0.07)" : "transparent",
        border: `1.5px solid ${hov ? tokens.peach : tokens.border}`,
        borderRadius: "10px",
        fontFamily: "'Manrope', sans-serif",
        fontWeight: 600,
        fontSize: large ? "16px" : "14px",
        color: hov ? tokens.peach : tokens.muted,
        cursor: "pointer",
        transform: hov ? "translateY(-1px)" : "none",
        transition: "all 0.22s ease",
        letterSpacing: "0.1px",
      }}
    >
      {children}
    </button>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ value, label, icon }: { value: string; label: string; icon: string }) {
  const [vis, setVis] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      padding: "28px 30px",
      background: tokens.bgCard,
      borderRadius: "16px",
      border: `1px solid ${tokens.border}`,
      boxShadow: tokens.shadow,
      opacity: vis ? 1 : 0,
      transform: vis ? "translateY(0)" : "translateY(24px)",
      transition: "opacity 0.6s ease, transform 0.6s ease",
      flex: "1",
    }}>
      <div style={{ fontSize: "22px", marginBottom: "8px" }}>{icon}</div>
      <div style={{
        fontFamily: "'Manrope', sans-serif",
        fontWeight: 800, fontSize: "36px",
        color: tokens.onyx, letterSpacing: "-1px",
      }}>{value}</div>
      <div style={{
        fontFamily: "'Manrope', sans-serif",
        fontSize: "13px", fontWeight: 500, color: tokens.muted, marginTop: "4px",
      }}>{label}</div>
    </div>
  );
}

// ─── FEATURE CARD ─────────────────────────────────────────────────────────────
function FeatureCard({
  icon, title, desc, delay = 0,
}: { icon: string; title: string; desc: string; delay?: number }) {
  const [hov, setHov] = useState(false);
  const [vis, setVis] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "32px",
        background: hov
          ? `linear-gradient(135deg, rgba(249,160,139,0.04), transparent)`
          : tokens.bgCard,
        borderRadius: "16px",
        border: `1px solid ${hov ? "rgba(249,160,139,0.28)" : tokens.border}`,
        boxShadow: hov ? tokens.shadowHover : tokens.shadow,
        transform: vis ? (hov ? "translateY(-4px)" : "translateY(0)") : "translateY(28px)",
        opacity: vis ? 1 : 0,
        transition: `all 0.4s cubic-bezier(0.34,1.2,0.64,1) ${delay}ms`,
        cursor: "default",
      }}
    >
      <div style={{
        width: "48px", height: "48px", borderRadius: "13px",
        background: hov
          ? `linear-gradient(135deg, ${tokens.peachLight}, ${tokens.peach})`
          : `rgba(249,160,139,0.10)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "22px", marginBottom: "20px",
        boxShadow: hov ? `0 6px 20px ${tokens.peachGlow}` : "none",
        transition: "all 0.3s ease",
      }}>
        {icon}
      </div>
      <h3 style={{
        fontFamily: "'Manrope', sans-serif",
        fontWeight: 700, fontSize: "17px",
        color: tokens.onyx, margin: "0 0 10px",
        letterSpacing: "-0.3px",
      }}>{title}</h3>
      <p style={{
        fontFamily: "'Manrope', sans-serif",
        fontSize: "14px", lineHeight: "1.65",
        color: tokens.muted, margin: 0,
      }}>{desc}</p>
    </div>
  );
}

// ─── TESTIMONIAL CARD ─────────────────────────────────────────────────────────
function TestimonialCard({
  quote, name, role, avatar, delay = 0,
}: { quote: string; name: string; role: string; avatar: string; delay?: number }) {
  const [vis, setVis] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      padding: "32px",
      background: tokens.bgCard,
      borderRadius: "20px",
      border: `1px solid ${tokens.border}`,
      boxShadow: tokens.shadow,
      opacity: vis ? 1 : 0,
      transform: vis ? "translateY(0)" : "translateY(28px)",
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
    }}>
      {/* Stars */}
      <div style={{ display: "flex", gap: "3px", marginBottom: "16px" }}>
        {[...Array(5)].map((_, i) => (
          <span key={i} style={{ color: tokens.peach, fontSize: "14px" }}>★</span>
        ))}
      </div>
      <p style={{
        fontFamily: "'Manrope', sans-serif",
        fontSize: "15px", lineHeight: "1.7",
        color: "#333", margin: "0 0 24px",
        fontStyle: "italic",
      }}>"{quote}"</p>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "42px", height: "42px", borderRadius: "50%",
          background: `linear-gradient(135deg, ${tokens.peachLight}, ${tokens.peach})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "18px", flexShrink: 0,
        }}>{avatar}</div>
        <div>
          <div style={{
            fontFamily: "'Manrope', sans-serif",
            fontWeight: 700, fontSize: "14px", color: tokens.onyx,
          }}>{name}</div>
          <div style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: "12px", color: tokens.muted, marginTop: "2px",
          }}>{role}</div>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD MOCKUP ─────────────────────────────────────────────────────────
function DashboardMockup() {
  const bars = [62, 80, 45, 95, 70, 55, 88];
  return (
    <div style={{
      width: "100%",
      background: tokens.bgCard,
      borderRadius: "20px",
      border: `1px solid ${tokens.border}`,
      boxShadow: "0 32px 80px -16px rgba(26,26,26,0.14)",
      overflow: "hidden",
    }}>
      {/* Browser chrome */}
      <div style={{
        padding: "14px 20px",
        background: "#F5F4F2",
        borderBottom: `1px solid ${tokens.border}`,
        display: "flex", alignItems: "center", gap: "8px",
      }}>
        <div style={{ width:"10px",height:"10px",borderRadius:"50%",background:"#FFC77D" }} />
        <div style={{ width:"10px",height:"10px",borderRadius:"50%",background:"#FFDF5D" }} />
        <div style={{ width:"10px",height:"10px",borderRadius:"50%",background:"#7DCF87" }} />
        <div style={{
          flex:1, margin:"0 12px",
          padding:"4px 12px", background:"rgba(255,255,255,0.8)",
          borderRadius:"6px", border:`1px solid ${tokens.border}`,
          fontSize:"11px", color:tokens.muted,
          fontFamily:"'Manrope', sans-serif",
          textAlign:"center",
        }}>app.velora.io/dashboard</div>
      </div>

      {/* Sidebar + Content */}
      <div style={{ display:"flex", height:"380px" }}>
        {/* Mini sidebar */}
        <div style={{
          width:"56px", background:"#F9F8F7",
          borderRight:`1px solid ${tokens.border}`,
          display:"flex", flexDirection:"column",
          alignItems:"center", paddingTop:"20px", gap:"18px",
        }}>
          {["⬛","📅","👥","💬","📊","⚙️"].map((ico,i) => (
            <div key={i} style={{
              width:"34px",height:"34px",borderRadius:"9px",
              background: i===0 ? `linear-gradient(135deg,${tokens.peachLight},${tokens.peach})` : "transparent",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:"15px", cursor:"pointer",
            }}>{ico}</div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex:1, padding:"24px", overflowY:"auto" }}>
          <div style={{ marginBottom:"20px" }}>
            <div style={{
              fontFamily:"'Manrope', sans-serif",
              fontWeight:800, fontSize:"18px", color:tokens.onyx,
              letterSpacing:"-0.4px",
            }}>Дашборд</div>
            <div style={{
              fontFamily:"'Manrope', sans-serif",
              fontSize:"12px", color:tokens.muted, marginTop:"2px",
            }}>Понедельник, 1 июня 2026</div>
          </div>

          {/* Mini stat row */}
          <div style={{ display:"flex", gap:"10px", marginBottom:"20px" }}>
            {[
              { v:"248", l:"Записей", c: tokens.peach },
              { v:"94%", l:"Заполн.", c: tokens.pistachio },
              { v:"₽186K", l:"Выручка", c: "#7BA7D4" },
            ].map((s,i)=>(
              <div key={i} style={{
                flex:1, padding:"12px 14px",
                background:tokens.bgCard,
                borderRadius:"12px",
                border:`1px solid ${tokens.border}`,
                boxShadow:"0 2px 8px rgba(0,0,0,0.04)",
              }}>
                <div style={{
                  fontFamily:"'Manrope', sans-serif",
                  fontWeight:800, fontSize:"20px", color: s.c,
                  letterSpacing:"-0.5px",
                }}>{s.v}</div>
                <div style={{
                  fontFamily:"'Manrope', sans-serif",
                  fontSize:"10px", color:tokens.muted, marginTop:"2px",
                }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Mini chart */}
          <div style={{
            padding:"16px", background:tokens.bgCard,
            borderRadius:"12px", border:`1px solid ${tokens.border}`,
          }}>
            <div style={{
              fontFamily:"'Manrope', sans-serif",
              fontSize:"11px", fontWeight:700, color:tokens.onyx,
              marginBottom:"12px",
            }}>Записи на неделю</div>
            <div style={{
              display:"flex", alignItems:"flex-end", gap:"6px", height:"64px",
            }}>
              {bars.map((h,i)=>(
                <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"4px" }}>
                  <div style={{
                    width:"100%",
                    height:`${h * 0.64}px`,
                    background: i===3
                      ? `linear-gradient(180deg,${tokens.peachLight},${tokens.peach})`
                      : `rgba(249,160,139,${0.15 + i*0.03})`,
                    borderRadius:"4px 4px 2px 2px",
                    transition:"height 0.4s ease",
                  }} />
                  <span style={{
                    fontFamily:"'Manrope', sans-serif",
                    fontSize:"8px", color:tokens.muted,
                  }}>{"ПВСЧПСВ"[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN LANDING ─────────────────────────────────────────────────────────────
export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    // Hero entrance
    setTimeout(() => setHeroVisible(true), 100);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: tokens.bg,
      fontFamily: "'Manrope', sans-serif",
      overflowX: "hidden",
      position: "relative",
    }}>
      {/* Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: ${tokens.bg}; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(249,160,139,0.3); border-radius: 4px; }
        .hero-word { display: inline-block; animation: wordIn 0.7s cubic-bezier(0.34,1.4,0.64,1) both; }
        @keyframes wordIn { from{opacity:0;transform:translateY(20px) scale(0.96)} to{opacity:1;transform:none} }
        .fade-up { opacity: 0; transform: translateY(20px); animation: fadeUp 0.6s ease forwards; }
        @keyframes fadeUp { to { opacity: 1; transform: none; } }
        .shimmer-line {
          position: relative; overflow: hidden;
        }
        .shimmer-line::after {
          content:''; position:absolute; inset:0;
          background: linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent);
          animation: shimmer 3s ease-in-out infinite;
        }
        @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
      `}</style>

      <Orbs />

      {/* ── NAVBAR ── */}
      <nav style={{
        position: "fixed", top: "16px", left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        width: "calc(100% - 48px)", maxWidth: "1200px",
        padding: "14px 28px",
        background: scrolled ? "rgba(253,252,251,0.85)" : "rgba(253,252,251,0.6)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: "16px",
        border: `1px solid ${scrolled ? "rgba(249,160,139,0.18)" : tokens.border}`,
        boxShadow: scrolled ? "0 8px 40px -12px rgba(26,26,26,0.12)" : "none",
        transition: "all 0.3s ease",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Logo />

        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <NavLink>О продукте</NavLink>
          <NavLink>Возможности</NavLink>
          <NavLink>Тарифы</NavLink>
          <NavLink>Отзывы</NavLink>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <GhostBtn>Войти</GhostBtn>
          <PrimaryBtn>Начать бесплатно</PrimaryBtn>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        paddingTop: "120px", paddingBottom: "80px",
        position: "relative", zIndex: 1,
        maxWidth: "1200px", margin: "0 auto",
        padding: "120px 48px 80px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "80px", width: "100%" }}>
          {/* Left copy */}
          <div style={{ flex: "1", maxWidth: "560px" }}>
            <div style={{
              marginBottom: "24px",
              opacity: heroVisible ? 1 : 0,
              transition: "opacity 0.5s ease 0.1s",
            }}>
              <Badge>Новый стандарт CRM в 2026</Badge>
            </div>

            <h1 style={{
              fontSize: "clamp(42px, 5vw, 62px)",
              fontWeight: 900,
              color: tokens.onyx,
              letterSpacing: "-2px",
              lineHeight: "1.08",
              marginBottom: "28px",
            }}>
              {["CRM,", "которой", "хочется", "пользоваться"].map((w, i) => (
                <span
                  key={i}
                  className="hero-word"
                  style={{
                    animationDelay: `${0.2 + i * 0.1}s`,
                    marginRight: i < 3 ? (i === 0 ? "0.28em" : "0.28em") : "0",
                    display: i === 2 ? "block" : "inline-block",
                    color: i === 3 ? tokens.peach : tokens.onyx,
                  }}
                >
                  {w}
                </span>
              ))}
            </h1>

            <p style={{
              fontSize: "17px", lineHeight: "1.75",
              color: tokens.muted, marginBottom: "40px",
              fontWeight: 400,
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? "none" : "translateY(12px)",
              transition: "all 0.6s ease 0.7s",
            }}>
              Velora — премиальная B2B CRM для студий, барбершопов и салонов.
              Управляйте записями, клиентами и командой в одном пространстве —
              без лишних кликов, без боли.
            </p>

            <div style={{
              display: "flex", gap: "12px", flexWrap: "wrap",
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? "none" : "translateY(12px)",
              transition: "all 0.6s ease 0.85s",
            }}>
              <PrimaryBtn large>Попробовать 14 дней бесплатно</PrimaryBtn>
              <GhostBtn large>Смотреть демо →</GhostBtn>
            </div>

            {/* Social proof row */}
            <div style={{
              display: "flex", alignItems: "center", gap: "16px", marginTop: "32px",
              opacity: heroVisible ? 1 : 0,
              transition: "opacity 0.6s ease 1.1s",
            }}>
              <div style={{ display: "flex" }}>
                {["🧖","💇","🏋️","💅","✂️"].map((e,i)=>(
                  <div key={i} style={{
                    width:"32px",height:"32px",borderRadius:"50%",
                    background:`linear-gradient(135deg, ${tokens.peachLight}80, ${tokens.peach}80)`,
                    border:"2px solid white",
                    marginLeft: i > 0 ? "-8px" : "0",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:"14px",
                    boxShadow:"0 2px 8px rgba(0,0,0,0.08)",
                  }}>{e}</div>
                ))}
              </div>
              <div style={{ fontFamily:"'Manrope',sans-serif" }}>
                <span style={{ fontWeight:700, color:tokens.onyx, fontSize:"14px" }}>2 400+</span>
                <span style={{ color:tokens.muted, fontSize:"13px" }}> бизнесов уже используют</span>
              </div>
              <div style={{
                display:"flex", alignItems:"center", gap:"4px",
                padding:"4px 10px",
                background:"rgba(163,201,168,0.15)",
                borderRadius:"100px",
                border:"1px solid rgba(163,201,168,0.3)",
              }}>
                <span style={{ color:tokens.pistachio, fontSize:"12px" }}>★</span>
                <span style={{ fontWeight:700, fontSize:"13px", color:tokens.onyx }}>4.9</span>
              </div>
            </div>
          </div>

          {/* Right: Dashboard */}
          <div style={{
            flex: "1", maxWidth: "540px",
            opacity: heroVisible ? 1 : 0,
            transform: heroVisible ? "translateY(0) rotate(-1deg)" : "translateY(40px) rotate(-1deg)",
            transition: "all 0.9s cubic-bezier(0.34,1.1,0.64,1) 0.5s",
            filter: "drop-shadow(0 40px 80px rgba(26,26,26,0.10))",
          }}>
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section style={{
        maxWidth: "1200px", margin: "0 auto",
        padding: "0 48px 80px",
        position: "relative", zIndex: 1,
      }}>
        <div style={{ display: "flex", gap: "16px" }}>
          <StatCard value="2 400+" label="Активных бизнесов" icon="🏢" />
          <StatCard value="14.2M" label="Записей обработано" icon="📋" />
          <StatCard value="99.9%" label="Uptime за 2025" icon="⚡" />
          <StatCard value="4.9 / 5" label="Средний рейтинг" icon="★" />
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section style={{
        maxWidth: "1200px", margin: "0 auto",
        padding: "0 48px 100px",
        position: "relative", zIndex: 1,
      }}>
        <div style={{
          padding: "64px",
          background: `linear-gradient(135deg, rgba(249,160,139,0.06) 0%, rgba(163,201,168,0.05) 100%)`,
          borderRadius: "24px",
          border: `1px solid rgba(249,160,139,0.14)`,
          display: "flex", gap: "80px", alignItems: "center",
        }}>
          <div style={{ flex: "1" }}>
            <p style={{
              fontSize: "11px", fontWeight: 700,
              color: tokens.peach, letterSpacing: "2px",
              textTransform: "uppercase", marginBottom: "12px",
            }}>О нас</p>
            <h2 style={{
              fontSize: "clamp(28px, 3vw, 38px)",
              fontWeight: 800, color: tokens.onyx,
              letterSpacing: "-1px", lineHeight: "1.15",
              marginBottom: "20px",
            }}>Мы переосмыслили<br />то, каким должен быть бизнес-инструмент</h2>
            <p style={{
              fontSize: "15px", lineHeight: "1.75",
              color: tokens.muted, marginBottom: "28px",
            }}>
              Velora создана командой, которая сама вела студии и знала боль от
              громоздких CRM. Мы убрали всё лишнее и оставили только то, что
              реально работает. Минимум кликов — максимум результата.
            </p>
            <div style={{ display:"flex", gap:"32px" }}>
              {[["2021", "Год основания"], ["42", "Сотрудника"], ["18", "Стран"]].map(([v,l])=>(
                <div key={l}>
                  <div style={{
                    fontFamily:"'Manrope',sans-serif",
                    fontWeight:900, fontSize:"30px",
                    color:tokens.onyx, letterSpacing:"-1px",
                  }}>{v}</div>
                  <div style={{
                    fontFamily:"'Manrope',sans-serif",
                    fontSize:"12px", color:tokens.muted, marginTop:"2px",
                  }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual side */}
          <div style={{ flex: "1", position: "relative", height: "280px" }}>
            {[
              { top:"0", left:"0", w:"48%", h:"140px", emoji:"🏋️", label:"Фитнес" },
              { top:"0", right:"0", w:"48%", h:"140px", emoji:"💇", label:"Барбершоп" },
              { bottom:"0", left:"26%", w:"48%", h:"120px", emoji:"🧖", label:"SPA & Пилатес" },
            ].map((c,i)=>(
              <div key={i} style={{
                position:"absolute",
                top: (c as any).top, bottom: (c as any).bottom,
                left: (c as any).left, right: (c as any).right,
                width: c.w, height: c.h,
                background: tokens.bgCard,
                borderRadius:"16px",
                border:`1px solid ${tokens.border}`,
                boxShadow: tokens.shadow,
                display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center",
                gap:"8px",
              }}>
                <div style={{ fontSize:"32px" }}>{c.emoji}</div>
                <div style={{
                  fontFamily:"'Manrope',sans-serif",
                  fontSize:"13px", fontWeight:700, color:tokens.onyx,
                }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{
        maxWidth: "1200px", margin: "0 auto",
        padding: "0 48px 100px",
        position: "relative", zIndex: 1,
      }}>
        <div style={{ textAlign:"center", marginBottom:"56px" }}>
          <p style={{
            fontSize:"11px", fontWeight:700, color:tokens.peach,
            letterSpacing:"2px", textTransform:"uppercase", marginBottom:"12px",
          }}>Возможности</p>
          <h2 style={{
            fontSize:"clamp(28px, 3vw, 42px)",
            fontWeight:900, color:tokens.onyx,
            letterSpacing:"-1.5px", lineHeight:"1.1",
          }}>Всё, что нужно<br />в одном месте</h2>
        </div>

        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(3, 1fr)",
          gap:"16px",
        }}>
          {[
            { icon:"📅", title:"Умное расписание", desc:"Drag-and-drop запись, автоматические напоминания клиентам, синхронизация с Google Calendar.", delay:0 },
            { icon:"👥", title:"CRM клиентов", desc:"Полная история визитов, предпочтения, теги, сегментация — всё что нужно чтобы знать клиента лучше него самого.", delay:80 },
            { icon:"📊", title:"Аналитика в реальном времени", desc:"Конверсии, LTV, загруженность мастеров, выручка по услугам — живые дашборды без Excel.", delay:160 },
            { icon:"💬", title:"Чаты и уведомления", desc:"Встроенный мессенджер с клиентами, push-уведомления мастерам, групповые чаты команды.", delay:240 },
            { icon:"💳", title:"Платёжная система", desc:"Онлайн-оплата, депозиты, абонементы, разбивка по мастерам — всё внутри без сторонних касс.", delay:320 },
            { icon:"🔗", title:"API и интеграции", desc:"Подключайте Instagram, WhatsApp, Telegram-бот, 1С и любые сервисы через готовые интеграции.", delay:400 },
          ].map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{
        maxWidth: "1200px", margin: "0 auto",
        padding: "0 48px 100px",
        position: "relative", zIndex: 1,
      }}>
        <div style={{ textAlign:"center", marginBottom:"56px" }}>
          <p style={{
            fontSize:"11px", fontWeight:700, color:tokens.peach,
            letterSpacing:"2px", textTransform:"uppercase", marginBottom:"12px",
          }}>Отзывы</p>
          <h2 style={{
            fontSize:"clamp(28px, 3vw, 40px)",
            fontWeight:900, color:tokens.onyx, letterSpacing:"-1.5px",
          }}>Они уже выбрали<br />Velora</h2>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:"16px" }}>
          <TestimonialCard
            quote="После Altegio мы думали, что найти что-то лучше нереально. Velora разнесла все ожидания — интерфейс как у Apple, функции как у Oracle."
            name="Мария Ковалёва" role="Владелец, студия пилатеса FORM"
            avatar="🧘" delay={0}
          />
          <TestimonialCard
            quote="Ребята из команды, серьёзно — ваши конкуренты должны бояться. Мы ведём 3 барбершопа, и наконец-то есть инструмент на уровне наших стандартов."
            name="Артём Назаров" role="CEO, Barbershop Brothers"
            avatar="✂️" delay={120}
          />
          <TestimonialCard
            quote="Переехали с амоCRM за 2 дня. Клиенты сами записываются через бот, мастера не путаются, я сплю спокойно. Это не реклама, это честно."
            name="Елена Дорош" role="Директор, SPA-студия LUNA"
            avatar="💆" delay={240}
          />
        </div>
      </section>

      {/* ── CTA BLOCK ── */}
      <section style={{
        maxWidth: "1200px", margin: "0 auto",
        padding: "0 48px 120px",
        position: "relative", zIndex: 1,
      }}>
        <div style={{
          padding: "80px 64px",
          background: `linear-gradient(135deg, ${tokens.onyx} 0%, #2A2A2A 100%)`,
          borderRadius: "28px",
          textAlign: "center",
          position: "relative", overflow: "hidden",
        }}>
          {/* Peach glow inside dark card */}
          <div style={{
            position:"absolute", top:"-40%", left:"50%",
            transform:"translateX(-50%)",
            width:"600px", height:"300px",
            background:"radial-gradient(ellipse, rgba(249,160,139,0.18) 0%, transparent 70%)",
            pointerEvents:"none",
          }} />
          <div style={{ position:"relative", zIndex:1 }}>
            <p style={{
              fontSize:"12px", fontWeight:700, color:tokens.peach,
              letterSpacing:"2.5px", textTransform:"uppercase", marginBottom:"16px",
            }}>Начните сегодня</p>
            <h2 style={{
              fontSize:"clamp(32px, 4vw, 52px)",
              fontWeight:900, color:"white",
              letterSpacing:"-1.5px", lineHeight:"1.1",
              marginBottom:"20px",
            }}>
              Готовы перейти<br />
              <span style={{ color:tokens.peach }}>на новый уровень?</span>
            </h2>
            <p style={{
              fontSize:"16px", color:"rgba(255,255,255,0.55)",
              lineHeight:"1.7", marginBottom:"40px",
              maxWidth:"480px", margin:"0 auto 40px",
            }}>
              14 дней бесплатно. Без карточки. Без обязательств.
              Просто попробуйте и поймёте разницу.
            </p>
            <div style={{
              display:"flex", gap:"12px",
              justifyContent:"center", flexWrap:"wrap",
            }}>
              <PrimaryBtn large>Зарегистрироваться бесплатно</PrimaryBtn>
              <button style={{
                padding:"15px 32px",
                background:"rgba(255,255,255,0.08)",
                border:"1.5px solid rgba(255,255,255,0.16)",
                borderRadius:"10px",
                fontFamily:"'Manrope', sans-serif",
                fontWeight:600, fontSize:"15px",
                color:"rgba(255,255,255,0.75)",
                cursor:"pointer",
                letterSpacing:"0.1px",
              }}>Поговорить с командой</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: `1px solid ${tokens.border}`,
        padding: "40px 48px",
        maxWidth: "1200px", margin: "0 auto",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"relative", zIndex:1,
      }}>
        <Logo />
        <div style={{
          display:"flex", gap:"24px",
          fontFamily:"'Manrope',sans-serif",
          fontSize:"13px", color:tokens.muted,
        }}>
          <a href="#" style={{ color:tokens.muted, textDecoration:"none" }}>Конфиденциальность</a>
          <a href="#" style={{ color:tokens.muted, textDecoration:"none" }}>Условия</a>
          <a href="#" style={{ color:tokens.muted, textDecoration:"none" }}>Поддержка</a>
        </div>
        <div style={{
          fontFamily:"'Manrope',sans-serif",
          fontSize:"12px", color:"rgba(102,102,102,0.6)",
        }}>© 2026 Velora. Все права защищены.</div>
      </footer>
    </div>
  );
}