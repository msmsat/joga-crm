import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogoMark } from "../../../components/Icons";
import { getActiveToken } from "../../../utils/auth";
import { LEGAL_DOC_LINKS, LEGAL_LINK_PROPS, SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_URL } from "../../../utils/legal";

const LINKS = [
  { href: "#product", label: "Продукт" },
  { href: "#modules", label: "Модули" },
  { href: "#pricing", label: "Тарифы" },
  { href: "#faq", label: "Вопросы" },
];

// Каждая ссылка ведёт в свой раздел страницы, а не наверх: якоря глав живут в
// самих секциях (#product, #booking, #ai, …), у каждой есть scroll-mt под
// плавающую шапку. Пунктов-заглушек в подвале быть не должно — колонка
// «Отрасли» из пяти таких и ушла. Документы — настоящие файлы на бэкенде,
// они обязаны открываться без регистрации.
const FOOTER_COLUMNS: [string, { label: string; href: string }[]][] = [
  ["Продукт", [
    { label: "Возможности", href: "#product" },
    { label: "Модули", href: "#modules" },
    { label: "Онлайн-запись", href: "#booking" },
    { label: "Velora AI", href: "#ai" },
    { label: "Тарифы", href: "#pricing" },
  ]],
  ["Компания", [
    { label: "Чем отличаемся", href: "#difference" },
    { label: "О нас", href: "#about" },
    { label: "Вопросы и ответы", href: "#faq" },
    { label: "Поддержка", href: SUPPORT_WHATSAPP_URL },
  ]],
  ["Документы", LEGAL_DOC_LINKS],
];

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <a href="#top" className="flex shrink-0 items-center gap-2.5">
      <span className={`flex items-center justify-center rounded-[10px] bg-gradient-to-br from-[#FCAE91] to-[#F9A08B] shadow-[0_4px_14px_rgba(249,160,139,0.35)] ${compact ? "h-9 w-9" : "h-10 w-10"}`}>
        <LogoMark />
      </span>
      <span className="text-[19px] font-extrabold tracking-[-0.4px] text-white">
        Velora<span className="text-[#F9A08B]">.</span>
      </span>
    </a>
  );
}

export function LandingNav() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    // Фон непрозрачный, БЕЗ backdrop-blur. Блюр на липком элементе заставляет
    // браузер перечитывать и заново размывать всё, что под ним, на каждом кадре
    // прокрутки — на телефоне именно это роняло страницу до рывков. Та же
    // причина, по которой блюра нет у оверлеев кита (App.css, «ТЕЛЕФОН»).
    <nav
      className={`fixed left-1/2 top-3 z-50 flex w-[calc(100%-24px)] max-w-[1200px] -translate-x-1/2 items-center justify-between rounded-2xl px-4 py-2.5 transition-colors duration-300 sm:top-4 sm:px-5 sm:py-3 ${
        scrolled
          ? "border border-white/10 bg-[#141414] shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]"
          : "border border-transparent bg-transparent"
      }`}
    >
      <Wordmark compact />

      <div className="hidden items-center gap-8 lg:flex">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="group relative text-[14px] font-medium text-white/60 transition-colors hover:text-white"
          >
            {l.label}
            <span className="absolute -bottom-1.5 left-0 h-[1.5px] w-0 bg-[#F9A08B] transition-all duration-300 group-hover:w-full" />
          </a>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(getActiveToken() ? "/dashboard" : "/login")}
          className="rounded-lg px-3 py-2.5 text-[14px] font-semibold text-white/70 transition-colors hover:text-white sm:px-4"
        >
          Войти
        </button>
        <button className="btn btn-primary btn-size-normal" onClick={() => navigate("/register")}>
          Начать<span className="hidden sm:inline">&nbsp;бесплатно</span>
        </button>
      </div>
    </nav>
  );
}

export function LandingFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#101010]">
      <div className="mx-auto max-w-[1200px] px-6 py-16 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Wordmark />
            <p className="mt-5 max-w-[280px] text-[13px] leading-[1.7] text-white/40">
              Премиальная CRM для студий йоги и пилатеса. Записи, клиенты,
              деньги и AI — в одном пространстве.
            </p>
            {/* Здесь были кнопки Telegram / WhatsApp / Instagram, ведущие на
                #top: аккаунтов за ними нет. Остался один канал, за которым
                действительно кто-то отвечает — номер показан прямо в ссылке,
                чтобы его можно было забрать, не открывая WhatsApp. */}
            <a
              href={SUPPORT_WHATSAPP_URL}
              {...LEGAL_LINK_PROPS}
              className="mt-6 inline-flex rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-medium text-white/50 transition-colors hover:border-[#F9A08B] hover:text-[#F9A08B]"
            >
              WhatsApp&nbsp;{SUPPORT_WHATSAPP}
            </a>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {FOOTER_COLUMNS.map(([title, items]) => (
              <div key={title}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F9A08B]">{title}</p>
                <ul className="mt-5 space-y-3">
                  {items.map(({ label, href }) => (
                    <li key={label}>
                      <a
                        href={href}
                        {...(href.startsWith("#") ? {} : LEGAL_LINK_PROPS)}
                        className="text-[13px] text-white/45 transition-colors hover:text-white"
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Индикатор «Все системы в норме» убран: статус-страницы, которая бы
            его подтверждала, у нас нет — это была картинка, а не показание. */}
        <div className="mt-14 border-t border-white/10 pt-8 text-[12px] text-white/30">
          © 2026 Velora. Все права защищены.
        </div>
      </div>

      {/* Гигантский контурный вотермарк — только обводка, без заливки. */}
      <div
        aria-hidden
        className="select-none px-6 pb-2 text-center text-[19vw] font-black leading-[0.8] tracking-[-0.05em] text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.09)]"
      >
        VELORA
      </div>
    </footer>
  );
}
