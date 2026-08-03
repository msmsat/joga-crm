import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiltersGuide } from './FiltersGuide';
import { CATEGORY_ICONS } from './categoryIcons';
import type { CategoryStat } from '../../../../api/clients/clients.types';

export interface ClientsToolbarProps {
  categories: CategoryStat[];
  activeCatKey: string;
  onCatChange: (key: string) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  onAddClick: () => void;
  /** Тренер клиентов не заводит — создание клиента на сервере owner+admin. */
  canAdd?: boolean;
}

export function ClientsToolbar({
  categories, activeCatKey, onCatChange,
  searchQuery, onSearch, onAddClick, canAdd = true,
}: ClientsToolbarProps) {
  const { t } = useTranslation('clients');

  // Priority+: в ряд помещается столько категорий, сколько реально влезает по
  // ширине — остальные не пропадают, они все есть в панели «Фильтры» рядом.
  // Прячем через visibility, а не display: коробка остаётся в потоке, поэтому
  // следующий замер видит те же координаты и раскладка не «дышит».
  const tabsRef = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState<string[]>([]);

  useLayoutEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const fit = () => {
      // getBoundingClientRect, а не offsetLeft: offsetParent у чипов — ближайший
      // позиционированный предок (на странице клиентов это .panelContainer),
      // и координаты считались бы не от ряда категорий.
      const right = el.getBoundingClientRect().right;
      const next: string[] = [];
      (Array.from(el.children) as HTMLElement[]).forEach((kid, i) => {
        // При переносе (десктоп) условие не срабатывает ни для кого — замер
        // становится безобидным no-op, отдельная ветка не нужна.
        if (kid.getBoundingClientRect().right > right + 0.5) next.push(categories[i].key);
      });
      setCut(prev =>
        prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // activeCatKey — обязателен: выбранный чип уезжает в начало ряда (order:-1),
    // и если его выбрали из панели «Фильтры», пока он был скрыт, пересчёт
    // обязан вернуть его на экран. t — на случай смены языка: подписи меняют ширину.
  }, [categories, activeCatKey, t]);

  return (
    <>
      <style>{`
        .ct-row {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          margin-bottom: var(--section-gap);
          flex-shrink: 0;
        }
        .ct-tabs {
          display: flex; align-items: center; gap: 4px;
          flex-wrap: wrap; flex: 0 1 auto; min-width: 0;
        }
        .ct-tab-cut { visibility: hidden; pointer-events: none; }
        /* Реально узкий экран: ряд не переносится, лишние категории уходят
           под кнопку «Фильтры», а выбранная всегда стоит первой и видна. */
        @media (max-width: 1180px) {
          .ct-row { flex-wrap: nowrap; }
          .ct-tabs { flex: 1 1 0; flex-wrap: nowrap; overflow: hidden; }
          .ct-tab.active { order: -1; }
        }
        .ct-tab {
          display: flex; align-items: center; gap: 5px;
          padding: 7px 12px; border-radius: 10px;
          font-size: 12px; font-weight: 600; color: var(--text2);
          border: none; background: transparent;
          cursor: pointer;
          transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
          font-family: var(--font); white-space: nowrap;
          position: relative;
        }
        .ct-tab:hover {
          background: rgba(var(--ink),0.04);
          color: var(--text);
          transform: translateY(-1px);
        }
        .ct-tab.active {
          color: var(--peach);
          background: rgba(249,160,139,0.08);
        }
        .ct-tab.active::after {
          content: '';
          position: absolute;
          bottom: 0; left: 10px; right: 10px;
          height: 2px;
          background: var(--peach);
          border-radius: 999px;
        }
        .ct-count {
          font-size: 10px; font-weight: 600;
          color: inherit; opacity: 0.5;
        }
        .ct-divider {
          width: 1px; height: 20px;
          background: var(--border2);
          margin: 0 4px; flex-shrink: 0;
        }
        .ct-search {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 13px; background: var(--card);
          border: 1px solid var(--border2); border-radius: 10px;
          transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
          flex-shrink: 0;
        }
        .ct-search:focus-within {
          border-color: rgba(249,160,139,0.5);
          box-shadow: 0 0 0 3px rgba(249,160,139,0.12);
        }
        .ct-search input {
          border: none; background: transparent; outline: none;
          font-size: 12px; font-weight: 500; color: var(--text);
          width: clamp(110px, 13vw, 190px); font-family: var(--font);
        }
        .ct-search input::placeholder { color: var(--text3); }
        .ct-add-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px;
          background: linear-gradient(135deg, #FCAE91, #F9A08B);
          border: none; border-radius: 10px;
          font-size: 12px; font-weight: 700; color: #fff;
          cursor: pointer; font-family: var(--font);
          box-shadow: 0 4px 14px rgba(249,160,139,0.3);
          white-space: nowrap; flex-shrink: 0;
          transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }
        .ct-add-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(249,160,139,0.4);
        }
        .ct-add-btn:active { transform: scale(0.97); }

        /* Телефон: два ряда вместо одного. Сверху — то, чем пользуются на
           каждом экране (поиск и «Добавить»), под ними отдельной строкой
           категории, которые листаются вбок. Прятать категории под кнопку
           «Фильтры», как на 1180px, здесь нельзя: на телефоне это главный
           способ сузить список, и он должен быть виден, а не спрятан. */
        @media (max-width: 767px) {
          .ct-row { flex-wrap: wrap; gap: 8px; row-gap: 8px; }
          .ct-divider { display: none; }
          .ct-tabs {
            flex: 1 0 100%;
            order: 2;
            flex-wrap: nowrap;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
          }
          .ct-tabs::-webkit-scrollbar { display: none; }
          .ct-tab { flex-shrink: 0; }
          /* Обрезание «лишних» категорий работало от ширины ряда — в строке со
             своим скроллом оно только прячет то, до чего можно долистать. */
          .ct-tab-cut { visibility: visible; pointer-events: auto; }
          /* flex-basis 0, а не auto: перенос считается по базису, и поиск со
             своим max-content (~205px) не влезал в строку рядом с «Фильтрами»
             — кнопка оставалась одна на целом ряду. С нулевым базисом все три
             контрола встают в одну строку, поиск забирает остаток. */
          .ct-search { flex: 1 1 0; min-width: 0; padding: 7px 10px; }
          .ct-search input { width: 100%; min-width: 0; }
          /* «Добавить клиента» ужимается до плюса: подпись съедает половину
             первого ряда, а иконка на кнопке-градиенте читается однозначно. */
          .ct-add-label { display: none; }
          .ct-add-btn { padding: 9px 13px; }
        }
      `}</style>

      <div className="ct-row">
        <div className="ct-tabs" ref={tabsRef}>
          {categories.map((cat) => {
            const icon = CATEGORY_ICONS[cat.key];
            const isActive = activeCatKey === cat.key;
            return (
              <button
                key={cat.key}
                className={`ct-tab${isActive ? ' active' : ''}${cut.includes(cat.key) ? ' ct-tab-cut' : ''}`}
                onClick={() => onCatChange(cat.key)}
              >
                {icon}
                {t(`categories.${cat.key}`, { defaultValue: cat.label })}
                <span className="ct-count">{cat.count}</span>
              </button>
            );
          })}
        </div>

        <div className="ct-divider" />

        <FiltersGuide
          categories={categories}
          activeCatKey={activeCatKey}
          onCatChange={onCatChange}
        />

        <div className="ct-divider" />

        <div className="ct-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
            placeholder={t('toolbar.searchPlaceholder')}
          />
        </div>

        {canAdd && (
          <button className="ct-add-btn" onClick={onAddClick}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span className="ct-add-label">{t('toolbar.addClient')}</span>
          </button>
        )}
      </div>
    </>
  );
}
