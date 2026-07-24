# Эпик N-7 — Изоляция клика по тумблеру от карточки канала

**Аудит, пункт 2:** «При клике на сам переключатель (вкл/выкл Telegram или
Email) открывается модальное окно настройки. Модалка должна открываться
ТОЛЬКО при клике на область карточки вне переключателя.»

**Обозначения сложности:** 🟢 простая · 🟡 средняя · 🔴 сложная.

---

## 1. Описание проблемы и цель

### Что видит пользователь
Хочет временно выключить Telegram — жмёт тумблер. Тумблер переключается,
и поверх страницы вылетает модалка настройки бота с полем токена. Каждый раз.

### Корневая причина (найдена в коде)

Два обработчика на одной оси всплытия, ни одного `stopPropagation`:

| Где | Код | Что делает |
|---|---|---|
| [`ChannelsSidebar.tsx:67`](../../front/src/pages/dashboard/Notifications/components/sections/ChannelsSidebar.tsx#L67) | `onClick={requiresIntegration ? handleClick : undefined}` на `<div>` строки канала | Открывает модалку |
| [`ChannelsSidebar.tsx:104`](../../front/src/pages/dashboard/Notifications/components/sections/ChannelsSidebar.tsx#L104) | `<ToggleSwitch on={…} onChange={() => toggleChannel(ch.key)} />` — потомок этого `<div>` | Переключает канал |
| [`ToggleSwitch.tsx:4`](../../front/src/pages/dashboard/Notifications/components/ui/ToggleSwitch.tsx#L4) | `<button onClick={onChange}>` | **Событие всплывает на строку → срабатывают оба** |

Показательно: кнопка «Подключить» в той же строке
([`ChannelsSidebar.tsx:94`](../../front/src/pages/dashboard/Notifications/components/sections/ChannelsSidebar.tsx#L94))
уже делает `e.stopPropagation()`. В тумблере — забыли. Т.е. паттерн в файле
установлен, нарушение точечное.

### Цель
Клик по тумблеру переключает канал и **не** открывает модалку. Клик по любой
другой части строки открывает модалку. Плюс закрыть попутный дефект
доступности: строка — это кликабельный `<div>` без клавиатуры.

### Границы
Правка идёт **внутрь `ToggleSwitch`**, а не в каждый вызов. У компонента
ровно один потребитель (проверено grep'ом:
`ChannelsSidebar.tsx:104`), но переключатель по смыслу — атомарный контрол:
клик по нему никогда не должен считаться кликом по подложке. Одна правка в
общем компоненте вместо правки на каждом будущем месте вызова.

> Одноимённый локальный `ToggleSwitch` в
> [`Loyalty/components/sections/ScenariosBoard.tsx:68`](../../front/src/pages/dashboard/Loyalty/components/sections/ScenariosBoard.tsx#L68) —
> **другой компонент**, к этому эпику отношения не имеет, не трогаем.

---

## 2. Database & Schema

**Изменений нет.** Эпик чисто фронтовый — исправляется поведение UI, не данные.

---

## 3. Backend

**Изменений нет.** Ни новых роутов, ни правок существующих.

---

## 4. Frontend

### Задача 1 · `stopPropagation` в `ToggleSwitch` · 🟢 · 0:15

**Файл:** [`front/src/pages/dashboard/Notifications/components/ui/ToggleSwitch.tsx`](../../front/src/pages/dashboard/Notifications/components/ui/ToggleSwitch.tsx)

```tsx
interface Props {
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export default function ToggleSwitch({ on, onChange, disabled, 'aria-label': ariaLabel }: Props) {
  return (
    <button
      type="button"                    // ← не сабмитит форму, если однажды окажется внутри
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={e => {
        e.stopPropagation();           // ← ЯДРО ЭПИКА: клик не доходит до onClick строки
        onChange();
      }}
      style={{ /* стили без изменений */ }}
    >
      <span style={{ /* без изменений */ }} />
    </button>
  );
}
```

Ключевые моменты:
- `e.stopPropagation()` покрывает и клавиатуру: активация `<button>` через
  Enter/Space генерирует тот же синтетический `click`, который так же
  останавливается. Отдельный `onKeyDown` не нужен.
- `preventDefault()` **не** нужен — у `<button type="button">` нет дефолтного
  действия, которое мешало бы.
- `disabled` добавляется под задачу 3 (блокировка на время PATCH).

### Задача 2 · Доступность строки канала · 🟡 · 0:30

**Файл:** [`ChannelsSidebar.tsx:65-73`](../../front/src/pages/dashboard/Notifications/components/sections/ChannelsSidebar.tsx#L65-L73)

Кликабельный `<div>` без роли и `tabIndex` недоступен с клавиатуры и невиден
скринридеру. Чинится в том же проходе (иначе `stopPropagation` останется
единственной правкой файла, а дыра — на месте):

```tsx
<div
  key={ch.key}
  role={requiresIntegration ? 'button' : undefined}
  tabIndex={requiresIntegration ? 0 : undefined}
  aria-label={requiresIntegration ? t('channels.openSettings', { channel: ch.label }) : undefined}
  onClick={requiresIntegration ? handleClick : undefined}
  onKeyDown={requiresIntegration ? (e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); }
  }) : undefined}
  style={{ /* без изменений */ }}
>
```

`e.preventDefault()` в `onKeyDown` нужен — иначе пробел проскроллит страницу.
Внутренние `<button>` (тумблер и «Подключить») получают фокус раньше строки в
tab-порядке и обрабатывают свой Enter/Space сами, до строки событие не дойдёт.

Ключ `channels.openSettings` добавить в
`front/src/locales/ru/notifications.json` и `front/src/locales/en/notifications.json`
(i18n обязателен, см. ROADMAP модуля).

### Задача 3 · Блокировка тумблера на время запроса · 🟢 · 0:20

**Файл:** [`useNotifications.ts:85-99`](../../front/src/pages/dashboard/Notifications/hooks/useNotifications.ts#L85-L99) + `ChannelsSidebar.tsx`

Сейчас тумблер можно щёлкать быстрее, чем отвечает `updateSettingsMut` — гонка
ответов может оставить UI рассинхронизированным с БД. Пробрасываем `isPending`:

```ts
// useNotifications.ts — в возвращаемый объект
return {
  channels, toggleChannel,
  channelSaving: updateSettingsMut.isPending,   // ← новое
  …
};
```

```tsx
// Notifications.tsx → ChannelsSidebar props → строка 104
<ToggleSwitch
  on={channels[ch.key]}
  onChange={() => toggleChannel(ch.key)}
  disabled={channelSaving}
  aria-label={ch.label}
/>
```

Дебаунс тут **не нужен**: канальный тумблер — один запрос на один осознанный
клик, а не серия. Дебаунс — тема эпика N-8 (матрица галочек).

### Задача 4 · Регресс-тест на изоляцию клика · 🟢 · 0:30

**Новый файл:** `front/src/pages/dashboard/Notifications/components/ui/ToggleSwitch.test.tsx`

Единственная обязательная проверка эпика — что клик не всплывает:

```tsx
it('клик по тумблеру не всплывает на подложку', async () => {
  const onChange = vi.fn();
  const onRowClick = vi.fn();
  render(
    <div onClick={onRowClick}>
      <ToggleSwitch on={false} onChange={onChange} />
    </div>,
  );
  await userEvent.click(screen.getByRole('switch'));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onRowClick).not.toHaveBeenCalled();   // ← падает на текущем коде
});
```

Если в проекте нет настроенного Vitest + Testing Library — тест не заводим,
а проверяем пункты 1–4 Acceptance Criteria руками. Поднимать тест-раннер
ради одного кейса не стоит.

---

## 5. Acceptance Criteria

| № | Шаг | Ожидаемо |
|---|---|---|
| 1 | Telegram подключён. Клик **по тумблеру** Telegram | Тумблер переключился, **модалка НЕ открылась** ← главный критерий |
| 2 | Клик по иконке / названию / подписи строки Telegram | Модалка настройки открылась, **тумблер не переключился** |
| 3 | То же для Email и WhatsApp | Поведение идентично |
| 4 | Быстрые 5 кликов по тумблеру | Ни одной модалки; в Network — запросы не наслаиваются (тумблер `disabled` во время PATCH) |
| 5 | Канал НЕ подключён (видна кнопка «Подключить») | Клик по кнопке открывает модалку; клик по строке — тоже (поведение как было) |
| 6 | Tab до строки канала, Enter | Открылась модалка |
| 7 | Tab до тумблера, Space | Тумблер переключился, **модалка не открылась**, страница не проскроллилась |
| 8 | Скринридер / DevTools Accessibility на тумблере | `role="switch"`, `aria-checked` соответствует состоянию, есть `aria-label` |
| 9 | Instagram / SMS / Push (без `MODAL_KEY`) | Клик по строке ничего не открывает, тумблер работает — регресса нет |
| 10 | После переключения тумблера F5 | Состояние сохранилось (зависимость от эпика N-6) |
| 11 | `cd front && npm run build && npm run lint` | Без ошибок |

---

## Оценка

| № | Задача | Слой | Сложность | Время |
|---|---|---|---|---|
| 1 | `stopPropagation` + `type="button"` в `ToggleSwitch` | Фронт | 🟢 | 0:15 |
| 2 | Доступность строки канала (`role`/`tabIndex`/`onKeyDown`) + i18n-ключ | Фронт | 🟡 | 0:30 |
| 3 | `disabled` тумблера на время PATCH | Фронт | 🟢 | 0:20 |
| 4 | Регресс-тест на всплытие | Фронт | 🟢 | 0:30 |

**Итого: ~1:35.**

**Зависимости:** независим от N-6 и N-8, можно делать первым — самый быстрый
видимый эффект для пользователя.
