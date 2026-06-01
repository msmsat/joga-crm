import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css"; // Обязательный импорт наших глобальных стилей
import { 
  Orbs, Logo, Badge, StatCard, FeatureCard, 
  TestimonialCard, DashboardMockup 
} from "../components/UI";

// ─── MAIN LANDING ─────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
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
    <div className="page-wrapper">
      <Orbs />

      {/* ── NAVBAR ── */}
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <Logo />

        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <a href="#" className="nav-link">О продукте</a>
          <a href="#" className="nav-link">Возможности</a>
          <a href="#" className="nav-link">Тарифы</a>
          <a href="#" className="nav-link">Отзывы</a>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button className="btn btn-ghost btn-size-normal" onClick={() => navigate('/login')}>
            Войти
          </button>
          <button className="btn btn-primary btn-size-normal" onClick={() => navigate('/login')}>
            Начать бесплатно
          </button>
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
              color: "var(--onyx)",
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
                    marginRight: i < 3 ? "0.28em" : "0",
                    display: i === 2 ? "block" : "inline-block",
                    color: i === 3 ? "var(--peach)" : "var(--onyx)",
                  }}
                >
                  {w}
                </span>
              ))}
            </h1>

            <p style={{
              fontSize: "17px", lineHeight: "1.75",
              color: "var(--muted)", marginBottom: "40px",
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
              <button className="btn btn-primary btn-size-large" onClick={() => navigate('/login')}>
                Попробовать 14 дней бесплатно
              </button>
              <button className="btn btn-ghost btn-size-large">
                Смотреть демо →
              </button>
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
                    background:`linear-gradient(135deg, rgba(252,174,145,0.8), rgba(249,160,139,0.8))`,
                    border:"2px solid white",
                    marginLeft: i > 0 ? "-8px" : "0",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:"14px",
                    boxShadow:"0 2px 8px rgba(0,0,0,0.08)",
                  }}>{e}</div>
                ))}
              </div>
              <div>
                <span style={{ fontWeight:700, color:"var(--onyx)", fontSize:"14px" }}>2 400+</span>
                <span style={{ color:"var(--muted)", fontSize:"13px" }}> бизнесов уже используют</span>
              </div>
              <div style={{
                display:"flex", alignItems:"center", gap:"4px",
                padding:"4px 10px",
                background:"rgba(163,201,168,0.15)",
                borderRadius:"100px",
                border:"1px solid rgba(163,201,168,0.3)",
              }}>
                <span style={{ color:"var(--pistachio)", fontSize:"12px" }}>★</span>
                <span style={{ fontWeight:700, fontSize:"13px", color:"var(--onyx)" }}>4.9</span>
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
              color: "var(--peach)", letterSpacing: "2px",
              textTransform: "uppercase", marginBottom: "12px",
            }}>О нас</p>
            <h2 style={{
              fontSize: "clamp(28px, 3vw, 38px)",
              fontWeight: 800, color: "var(--onyx)",
              letterSpacing: "-1px", lineHeight: "1.15",
              marginBottom: "20px",
            }}>Мы переосмыслили<br />то, каким должен быть бизнес-инструмент</h2>
            <p style={{
              fontSize: "15px", lineHeight: "1.75",
              color: "var(--muted)", marginBottom: "28px",
            }}>
              Velora создана командой, которая сама вела студии и знала боль от
              громоздких CRM. Мы убрали всё лишнее и оставили только то, что
              реально работает. Минимум кликов — максимум результата.
            </p>
            <div style={{ display:"flex", gap:"32px" }}>
              {[["2021", "Год основания"], ["42", "Сотрудника"], ["18", "Стран"]].map(([v,l])=>(
                <div key={l}>
                  <div style={{
                    fontWeight:900, fontSize:"30px",
                    color:"var(--onyx)", letterSpacing:"-1px",
                  }}>{v}</div>
                  <div style={{
                    fontSize:"12px", color:"var(--muted)", marginTop:"2px",
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
                background: "var(--bg-card)",
                borderRadius:"16px",
                border:`1px solid var(--border)`,
                boxShadow: "var(--shadow)",
                display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center",
                gap:"8px",
              }}>
                <div style={{ fontSize:"32px" }}>{c.emoji}</div>
                <div style={{
                  fontSize:"13px", fontWeight:700, color:"var(--onyx)",
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
            fontSize:"11px", fontWeight:700, color:"var(--peach)",
            letterSpacing:"2px", textTransform:"uppercase", marginBottom:"12px",
          }}>Возможности</p>
          <h2 style={{
            fontSize:"clamp(28px, 3vw, 42px)",
            fontWeight:900, color:"var(--onyx)",
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
            fontSize:"11px", fontWeight:700, color:"var(--peach)",
            letterSpacing:"2px", textTransform:"uppercase", marginBottom:"12px",
          }}>Отзывы</p>
          <h2 style={{
            fontSize:"clamp(28px, 3vw, 40px)",
            fontWeight:900, color:"var(--onyx)", letterSpacing:"-1.5px",
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
          background: `linear-gradient(135deg, var(--onyx) 0%, #2A2A2A 100%)`,
          borderRadius: "28px",
          textAlign: "center",
          position: "relative", overflow: "hidden",
        }}>
          {/* Peach glow inside dark card */}
          <div style={{
            position:"absolute", top:"-40%", left:"50%",
            transform:"translateX(-50%)",
            width:"600px", height:"300px",
            background:"radial-gradient(ellipse, var(--peach-glow) 0%, transparent 70%)",
            pointerEvents:"none",
          }} />
          <div style={{ position:"relative", zIndex:1 }}>
            <p style={{
              fontSize:"12px", fontWeight:700, color:"var(--peach)",
              letterSpacing:"2.5px", textTransform:"uppercase", marginBottom:"16px",
            }}>Начните сегодня</p>
            <h2 style={{
              fontSize:"clamp(32px, 4vw, 52px)",
              fontWeight:900, color:"white",
              letterSpacing:"-1.5px", lineHeight:"1.1",
              marginBottom:"20px",
            }}>
              Готовы перейти<br />
              <span style={{ color:"var(--peach)" }}>на новый уровень?</span>
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
              <button className="btn btn-primary btn-size-large">
                Зарегистрироваться бесплатно
              </button>
              <button style={{
                padding:"15px 32px",
                background:"rgba(255,255,255,0.08)",
                border:"1.5px solid rgba(255,255,255,0.16)",
                borderRadius:"10px",
                fontWeight:600, fontSize:"15px",
                color:"rgba(255,255,255,0.75)",
                cursor:"pointer",
                letterSpacing:"0.1px",
                transition: "all 0.2s ease"
              }}>Поговорить с командой</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: `1px solid var(--border)`,
        padding: "40px 48px",
        maxWidth: "1200px", margin: "0 auto",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"relative", zIndex:1,
      }}>
        <Logo />
        <div style={{
          display:"flex", gap:"24px",
          fontSize:"13px", color:"var(--muted)",
        }}>
          <a href="#" style={{ color:"var(--muted)", textDecoration:"none", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "var(--onyx)"} onMouseOut={(e) => e.currentTarget.style.color = "var(--muted)"}>Конфиденциальность</a>
          <a href="#" style={{ color:"var(--muted)", textDecoration:"none", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "var(--onyx)"} onMouseOut={(e) => e.currentTarget.style.color = "var(--muted)"}>Условия</a>
          <a href="#" style={{ color:"var(--muted)", textDecoration:"none", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "var(--onyx)"} onMouseOut={(e) => e.currentTarget.style.color = "var(--muted)"}>Поддержка</a>
        </div>
        <div style={{
          fontSize:"12px", color:"rgba(102,102,102,0.6)",
        }}>© 2026 Velora. Все права защищены.</div>
      </footer>
    </div>
  );
}