import { Dumbbell, Comb, Droplet } from "../../../components/Icons";
import { Reveal } from "./primitives";
import { ChapterHead } from "./ChapterHead";
import { GridBg } from "./Illustrations";

const REVIEWS = [
  {
    quote: "После Altegio мы думали, что найти что-то лучше нереально. Velora разнесла все ожидания — интерфейс как у Apple, функции как у Oracle.",
    name: "Мария Ковалёва", role: "Владелец, студия пилатеса FORM", Icon: Dumbbell,
  },
  {
    quote: "Ведём 3 барбершопа. Наконец-то инструмент на уровне наших стандартов — конкуренты должны бояться.",
    name: "Артём Назаров", role: "CEO, Barbershop Brothers", Icon: Comb,
  },
  {
    quote: "Переехали с амоCRM за 2 дня. Клиенты записываются через бот, мастера не путаются, я сплю спокойно.",
    name: "Елена Дорош", role: "Директор, SPA-студия LUNA", Icon: Droplet,
  },
];

function Stars({ onPeach = false }: { onPeach?: boolean }) {
  return (
    <div className={`flex gap-1 ${onPeach ? "text-[#101010]" : "text-[#F9A08B]"}`}>
      {[...Array(5)].map((_, i) => <span key={i} className="text-[13px]">★</span>)}
    </div>
  );
}

export function Testimonials() {
  const [lead, ...rest] = REVIEWS;

  return (
    <section id="reviews" className="relative scroll-mt-24 overflow-hidden bg-[#101010] py-24 lg:py-32">
      <GridBg />

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-12">
        <ChapterHead
          label="что говорят"
          index={5}
          title="Они уже выбрали Velora"
          lead="Отзывы студий, которые перешли на Velora с других систем."
        />

        {/* Редакционная раскладка: первый отзыв — крупный персиковый блок,
            остальные мельче. Однородная сетка из трёх карточек читается как
            таблица, а не как разворот журнала. */}
        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          <Reveal className="h-full lg:col-span-2">
            <figure className="flex h-full flex-col justify-between rounded-[24px] bg-[#F9A08B] p-9 lg:p-12">
              <div>
                <Stars onPeach />
                <blockquote className="mt-7 text-[clamp(20px,2.4vw,30px)] font-semibold leading-[1.35] tracking-[-0.02em] text-[#101010]">
                  «{lead.quote}»
                </blockquote>
              </div>
              <figcaption className="mt-10 flex items-center gap-3.5">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#101010] text-[#F9A08B]">
                  <lead.Icon width={20} height={20} />
                </span>
                <span>
                  <span className="block text-[14px] font-bold text-[#101010]">{lead.name}</span>
                  <span className="block text-[12px] text-[#101010]/60">{lead.role}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>

          <div className="grid gap-4">
            {rest.map((r, i) => (
              <Reveal key={r.name} delay={0.1 + i * 0.08} className="h-full">
                <figure className="flex h-full flex-col justify-between rounded-[24px] border border-white/10 bg-white/[0.02] p-8">
                  <div>
                    <Stars />
                    <blockquote className="mt-5 text-[14px] leading-[1.7] text-white/60">«{r.quote}»</blockquote>
                  </div>
                  <figcaption className="mt-7 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F9A08B]/12 text-[#F9A08B]">
                      <r.Icon width={17} height={17} />
                    </span>
                    <span>
                      <span className="block text-[13px] font-bold text-white">{r.name}</span>
                      <span className="block text-[11px] text-white/35">{r.role}</span>
                    </span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
