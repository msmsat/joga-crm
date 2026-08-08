import type { ComponentType, SVGProps } from "react";
import {
  Home, Calendar, Users, UserPlus, Building, LinkIcon, CardIcon, Bell,
  Sparkle, ChatBubble, ChartBar, Grid, List, Check, Gear, Clipboard,
} from "../../../components/Icons";
import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";
import { GridBg } from "./Illustrations";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const MODULES: [Icon, string, string][] = [
  [Home, "Дашборд", "Выручка, активные клиенты, записи и удержание — с трендом"],
  [Calendar, "Журнал", "Сетка дня по тренерам и залам, перенос перетаскиванием"],
  [Users, "Клиенты", "Карточка, абонемент, баллы, история, заметки, теги"],
  [UserPlus, "Сотрудники", "Профили, показатели, рабочие часы, привязка к залам"],
  [Building, "Каталог", "Филиалы, залы с цветом и вместимостью, услуги студии"],
  [LinkIcon, "Онлайн-запись", "Виджет, Telegram, WhatsApp, Instagram и правила записи"],
  [CardIcon, "Финансы", "Счета, операции, контрагенты, документы, цели, зарплаты"],
  [Bell, "Уведомления", "6 каналов и матрица «событие × канал» по получателям"],
  [Sparkle, "Лояльность", "Карты, скидки, сертификаты, абонементы, рефералы"],
  [ChatBubble, "Velora AI", "Ассистент по бизнесу и агенты для клиентов"],
  [ChartBar, "Отчёты", "По продажам, тренерам, услугам — с экспортом"],
  [Grid, "Мини-приложение", "Личный кабинет клиента: записи, абонемент, баллы"],
  [List, "Мультистудийность", "Несколько студий в одном аккаунте, переключение"],
  [Check, "Роли и доступы", "Владелец, администратор, тренер — и в UI, и на сервере"],
  [Gear, "Настройки", "Часы работы, тема, команда, безопасность, сессии"],
  [Clipboard, "Данные", "Экспорт, резервные копии, удаление по запросу"],
];

const INTEGRATIONS = ["WhatsApp", "Telegram", "Instagram", "Google Calendar", "1С", "ЮKassa"];

export function Modules() {
  return (
    <section id="modules" className="relative scroll-mt-24 overflow-hidden bg-[#101010] py-24 lg:py-32">
      <GridBg />

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label="модули"
          index={3}
          title={<>16 модулей,<br />которые уже включены</>}
          lead="Не набор заглушек «на будущее» — всё перечисленное работает и входит в тариф. Роли решают, кто какой раздел видит."
        />

        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map(([Icon, title, desc], i) => (
            <Reveal key={title} delay={(i % 4) * 0.06} className="h-full">
              <article className="group h-full rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-colors duration-300 hover:border-[#F9A08B] hover:bg-[#F9A08B]">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#F9A08B]/10 text-[#F9A08B] transition-colors duration-300 group-hover:bg-[#101010]">
                  <Icon width={18} height={18} />
                </div>
                <h3 className="text-[15px] font-bold tracking-[-0.01em] text-white transition-colors duration-300 group-hover:text-[#101010]">
                  {title}
                </h3>
                <p className="mt-2 text-[13px] leading-[1.6] text-white/40 transition-colors duration-300 group-hover:text-[#101010]/70">
                  {desc}
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15}>
          <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-white/10 bg-white/[0.02] px-8 py-7">
            <span className="text-[13px] font-bold uppercase tracking-[0.16em] text-[#F9A08B]">Интеграции</span>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {INTEGRATIONS.map((n) => (
                <span key={n} className="text-[14px] font-semibold text-white/55">{n}</span>
              ))}
            </div>
            <span className="text-[13px] text-white/30">и API-доступ на тарифе Business</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
