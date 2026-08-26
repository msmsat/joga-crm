import { useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";
import { FaqArt } from "./Illustrations";
import { EASE } from "./tokens";
import { LEGAL_LINK_PROPS, SUPPORT_EMAIL, SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_URL } from "../../../utils/legal";

const QA: [string, string][] = [
  ["Что входит в пробный период?",
   "Полный доступ ко всем модулям на 14 дней. Банковская карта не нужна — если не подойдёт, просто не продлевайте."],
  ["Мои клиенты увидят рекламу других студий?",
   "Нет. Клиент записывается через виджет на вашем сайте, ваш Telegram, WhatsApp или Instagram — и через мини-приложение с вашим цветом и логотипом. Общего каталога с чужими студиями не существует."],
  ["Кто из сотрудников что видит?",
   "Три роли. Владелец — всё. Администратор — журнал, клиентов и дашборд. Тренер — только свои занятия и своих клиентов. Ограничение работает и в интерфейсе, и на сервере: получить чужие данные в обход интерфейса нельзя."],
  ["Можно вести несколько студий или филиалов?",
   "Да, и это не зависит от тарифа. Один аккаунт может состоять в нескольких студиях с переключением между ними, а внутри студии заводятся филиалы и залы."],
  ["Есть тёмная тема и другие языки?",
   "Да, интерфейс переключается между светлой и тёмной темой и говорит по-русски и по-английски. Часовой пояс, валюта и язык задаются при онбординге."],
  ["Что будет с данными, если я решу уйти?",
   "Данные ваши. В настройках есть экспорт в CSV — клиенты, расписание, финансы, абонементы, — а удаление выполняется по вашему запросу."],
];

/** Один вопрос: плавная высота вместо нативного `<details>` (тот дёргает
    контент без анимации) и спринговая иконка +/×. Открыт — один за раз. */
function FaqItem({ q, a, index, open, onToggle }: {
  q: string; a: string; index: number; open: boolean; onToggle: () => void;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white transition-colors duration-300 ${
        open ? "border-[#F9A08B]/40" : "border-[#101010]/8"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-5 px-7 py-6 text-left"
      >
        <span className="mt-0.5 shrink-0 font-mono text-[12px] tabular-nums text-[#F9A08B]/70">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="flex-1 text-[15px] font-bold leading-[1.45] text-[#101010]">{q}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F9A08B]/12 text-[#F9A08B]"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <p className="px-7 pb-6 pl-14 text-[14px] leading-[1.7] text-[#666]">{a}</p>
      </motion.div>
    </div>
  );
}

/**
 * Ссылка-пилюля на email или WhatsApp: контур, на hover — персиковая заливка
 * иконки и лёгкий подъём.
 *
 * `copyValue` — для email: браузер не сообщает, есть ли у человека почтовый
 * клиент (mailto: уходит на уровень ОС без обратной связи), поэтому вместо
 * гадания по таймауту клик ВСЕГДА параллельно копирует адрес в буфер — рабочий
 * способ остаётся, даже если mailto: открыть было нечем.
 */
function ContactLink({ href, icon, label, copyValue }: {
  href: string; icon: ReactNode; label: string; copyValue?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <a
      href={href}
      {...(href.startsWith("mailto:") ? {} : LEGAL_LINK_PROPS)}
      onClick={async () => {
        if (!copyValue) return;
        try {
          await navigator.clipboard.writeText(copyValue);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // Буфер недоступен (нет HTTPS/разрешения) — mailto: всё равно сработает как обычно.
        }
      }}
      className="group flex items-center gap-3 rounded-xl border border-[#101010]/10 bg-white px-5 py-3.5 text-[14px] font-semibold text-[#101010] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#F9A08B] hover:shadow-[0_10px_28px_-10px_rgba(249,160,139,0.45)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F9A08B]/12 text-[#F9A08B] transition-colors duration-300 group-hover:bg-[#F9A08B] group-hover:text-white">
        {copied ? CheckIcon : icon}
      </span>
      {copied ? "Скопировано" : label}
    </a>
  );
}

const MailIcon = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="m2 4.5 6 4.5 6-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChatIcon = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M2 8.2c0-3.2 2.7-5.7 6-5.7s6 2.5 6 5.7-2.7 5.7-6 5.7c-.7 0-1.4-.1-2-.35L3 14.5l.75-2.55C2.65 11 2 9.7 2 8.2Z"
      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const CheckIcon = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="m3.5 8.4 3.2 3.2L12.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="scroll-mt-24 bg-[#FDFCFB] pb-24 pt-8 lg:pb-32">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label="вопросы"
          index={5}
          tone="light"
          title="Что обычно спрашивают"
        />

        <div className="mt-14 grid gap-14 lg:grid-cols-[1fr_260px] lg:items-start">
          <div className="space-y-3">
            {QA.map(([q, a], i) => (
              <Reveal key={q} delay={(i % 2) * 0.06}>
                <FaqItem
                  q={q} a={a} index={i}
                  open={open === i}
                  onToggle={() => setOpen(open === i ? null : i)}
                />
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.15} className="hidden lg:block">
            <div className="sticky top-28 mx-auto w-full max-w-[220px]">
              <FaqArt active={open} total={QA.length} />
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="mt-8 flex flex-col items-center justify-between gap-6 rounded-[24px] border border-[#101010]/8 bg-[#F9A08B]/[0.05] px-8 py-9 sm:flex-row lg:px-10">
            <div>
              <p className="text-[16px] font-bold text-[#101010]">Не нашли ответ?</p>
              <p className="mt-1.5 text-[14px] leading-[1.6] text-[#666]">Напишите нам — отвечаем сами, без ботов и очереди.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ContactLink href={`mailto:${SUPPORT_EMAIL}`} icon={MailIcon} label={SUPPORT_EMAIL} copyValue={SUPPORT_EMAIL} />
              <ContactLink href={SUPPORT_WHATSAPP_URL} icon={ChatIcon} label={`WhatsApp ${SUPPORT_WHATSAPP}`} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
