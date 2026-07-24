# EPIC 4 — Subscription & Billing (вкладка «Подписка»)

**Цель:** вкладка перестаёт быть витриной и начинает показывать реальную
подписку студии. Убрать «Способ оплаты», условная кнопка «Улучшить
тариф», рабочий экспорт CSV, история платежей с пагинацией.

**Зависимости:** эпик 1. **Оценка: ~5:30.**

---

## Точка отсчёта

**Бэк готов практически целиком** — это самая приятная новость раздела.
`back/routers/billing/`: каталог тарифов (`plans.py` — источник истины о
ценах), `GET /billing/plan`, `GET /billing/invoices`, `GET /billing/cards`,
`POST /billing/checkout` и `/renew` (Fondy), вебхук, возвраты.
`front/src/api/billing/billing.api.ts` — все методы описаны и типизированы.

**Фронт вкладки при этом на 100 % мок.** `hooks/useBilling.ts` (349 строк
`BillingTab.tsx` над ним) — это девять `useState` и четыре функции вида:

```ts
const addCard = () => { triggerToast("Карта успешно добавлена и привязана"); }
const upgradeToBusinessView = () => { triggerToast("Заявка на тариф Business подтверждена!"); }
```

Ни одного запроса. При этом рядом, в `/dashboard/billing`, живёт
**полноценная страница тарифов**, которая с сервером работает.

**Вывод, определяющий эпик:** вкладка «Подписка» в Настройках — это не
второй биллинг, а **сводка + вход в него**. Всё, что дублирует
`/dashboard/billing` (калькулятор периодов, сравнение тарифов, форма
карты), из вкладки убирается: держать два места, где меняется тариф, —
это два места, где он ломается.

---

## User Stories

- **Как владелец** я вижу свой реальный тариф, дату следующего списания и
  сумму — те же, что в разделе «Тариф и оплата».
- **Как владелец** на проценте от оборота я **не вижу** кнопку «Улучшить
  тариф» — она для моей схемы оплаты бессмысленна.
- **Как владелец** на максимальном тарифе я не вижу предложения улучшить
  то, что улучшить нельзя.
- **Как владелец** я выгружаю историю платежей в CSV и открываю её в
  Excel — файл настоящий.
- **Как владелец** я вижу последние 12 платежей, а не бесконечную ленту;
  за остальным иду на отдельную страницу.

---

## Задача 1. Удалить «Способ оплаты» из вкладки (~0:30)

Управление картой остаётся ровно в одном месте — `/dashboard/billing`
(`components/tabs/PaymentMethodTab.tsx`), там же, где происходит оплата
и где карта реально привязывается через `rectoken` Fondy.

**Удалить из `Settings/hooks/useBilling.ts`:** `isAddingCard`,
`cardNumber`, `cardName`, `cardExpiry`, `cardCvc`, `cardFocused`,
`addCard`, `replaceCard`. **Из `BillingTab.tsx`** — всю секцию формы
карты и анимацию переворота.

Вместо формы — строка «Карта •••• 4242» (из `GET /billing/cards`,
read-only) с кнопкой «Изменить» → `navigate('/dashboard/billing')`.
Нет карты → строка «Карта не привязана» + та же кнопка.

> Причина не косметическая: форма карты в двух местах — это два места,
> где можно ошибиться с PCI-периметром. Реквизиты вводятся на стороне
> Fondy, а не у нас; вкладка настроек к ним не прикасается.

## Задача 2. Бэк: расширить `GET /billing/plan` (~0:45)

Колонки `billing_mode`, `percent_rate`, `fixed_base_amount` **лежат в БД
с миграции `6aaea90e19ed` и ни разу не читаются кодом**. Логика кнопки
«Улучшить тариф» из ТЗ опирается именно на них — значит, их пора отдать
на фронт.

`back/routers/billing/router.py`, схема
`back/schemas/settings/billing.py::BillingPlanRead` — добавить поля:

```jsonc
{
  "plan_name": "pro",
  "billing_cycle": "monthly",
  "status": "active",
  "expires_at": "2026-08-23T00:00:00",
  "max_staff": 15,
  "auto_renewal": true,

  "billing_mode": "fix",          // NEW: "fix" | "percent_fix" | "percent"
  "percent_rate": null,           // NEW: % от оборота, если применимо
  "fixed_base_amount": null,      // NEW: фиксированная часть, копейки
  "can_upgrade": true,            // NEW: вычисляется на бэке, см. ниже
  "next_plan": "business"         // NEW: null, если апгрейда нет
}
```

**`can_upgrade` считает сервер, не фронт:**

```python
UPGRADE_PATH = ["start", "pro", "business"]     # порядок из plans.PLANS

def _upgrade_target(row: StudioBillingPlan | None) -> str | None:
    if row is None or row.billing_mode not in ("fix", "percent_fix"):
        return None                              # % от оборота — апгрейда нет
    if row.status != "active":
        return None                              # неоплаченный не апгрейдим
    idx = UPGRADE_PATH.index(row.plan_name) if row.plan_name in UPGRADE_PATH else -1
    if idx < 0 or idx == len(UPGRADE_PATH) - 1:
        return None                              # неизвестный или максимальный
    return UPGRADE_PATH[idx + 1]
```

Правило из ТЗ («показывать, если тип `fix` или `%+fix` и это не
максимальный тариф») живёт **в одном месте на сервере**. Дублировать
условие в JSX — гарантированный рассинхрон при появлении четвёртого
тарифа.

Дефолт `billing_mode` в модели — `"subscription"`; при чтении трактуем
его как `"fix"` (обычная подписка), либо разово нормализуем данные
миграцией `UPDATE studio_billing_plans SET billing_mode='fix' WHERE billing_mode='subscription'`.
Второе честнее — значения перечисления перестают жить в двух написаниях.

## Задача 3. Бэк: пагинация истории платежей (~0:30)

`GET /billing/invoices` сейчас отдаёт **все** счета студии без лимита.
Добавить query-параметры (обратная совместимость сохраняется — у обоих
есть дефолты):

```
GET /billing/invoices?limit=12&offset=0
→ 200 {"items": [...], "total": 47}
```

`limit: int = Query(12, ge=1, le=100)` — верхняя граница обязательна,
иначе `?limit=999999` превращается в способ положить БД.

> ⚠️ Ответ меняет форму: был голый массив, стал объект с `items`.
> Правится один потребитель — `billingApi.getInvoices()` +
> `InvoicesTab.tsx` на `/dashboard/billing`. Проверить grep'ом
> `getInvoices` перед мержем.

## Задача 4. Бэк: реальный экспорт CSV (~1:00)

**Слой:** `back/services/exporter.py` (новый — общий генератор, его же
использует эпик 7) + ручка в `back/routers/billing/router.py`.

```
GET /billing/invoices/export?format=csv[&date_from&date_to]
→ 200 text/csv; charset=utf-8
   Content-Disposition: attachment; filename="velora-invoices-2026-07-23.csv"
```

```python
# services/exporter.py
def csv_stream(header: list[str], rows: Iterable[Iterable]) -> Iterator[str]:
    """Ленивая генерация CSV: не собираем весь файл в память."""
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")     # ; — Excel в ru-локали
    yield "﻿"                              # BOM: иначе Excel ест кириллицу
    writer.writerow(header)
    yield _flush(buf)
    for row in rows:
        writer.writerow(row)
        yield _flush(buf)
```

Ручка:

```python
return StreamingResponse(
    csv_stream(["Дата", "Тариф", "Период", "Сумма", "Метод", "Статус"], rows),
    media_type="text/csv; charset=utf-8",
    headers={"Content-Disposition": f'attachment; filename="{fname}"'},
)
```

**Три вещи, на которых экспорт обычно ломается, — решены сразу:**
1. **BOM** — без него Excel открывает кириллицу кракозябрами.
2. **`;` вместо `,`** — в русской локали Excel не разбивает по запятой.
3. **Стриминг** — файл не материализуется в памяти целиком.

**Заголовки колонок локализуются по `Studio.language`**
(`_studio_prefs(db, studio_id)` уже написан в `notifier.py:53`) —
требование тотальной локализации распространяется и на выгрузки. Суммы —
в единицах валюты (копейки / 100), символ валюты **в заголовке колонки**
(`"Сумма, ₽"`), а не в каждой ячейке: иначе колонка перестаёт быть
числовой для Excel.

**CORS-нюанс.** Скачивание идёт `fetch` с `Authorization`-заголовком
(токен в `localStorage`, не в куке) → браузер не отдаст имя файла из
`Content-Disposition`, если заголовок не разрешён. Добавить в
`CORSMiddleware` в `back/main.py`:
`expose_headers=["Content-Disposition"]`. Без этого фронт скачает файл с
именем вида `blob`.

## Задача 5. Фронт: `BillingTab` на реальных данных (~2:00)

**Файлы:** `components/tabs/BillingTab.tsx` (переписать, −200 строк),
`hooks/useBilling.ts` (переписать целиком), `api/billing/billing.api.ts`
(+ `exportInvoices`, `+limit/offset` в `getInvoices`),
`api/billing/billing.types.ts` (+ новые поля `BillingPlan`).

```ts
export function useBilling() {
  const plan = useQuery({ queryKey: queryKeys.billingPlan, queryFn: billingApi.getPlan });
  const invoices = useQuery({
    queryKey: queryKeys.billingInvoices(12),
    queryFn: () => billingApi.getInvoices({ limit: 12 }),
  });
  const cards = useQuery({ queryKey: queryKeys.billingCards, queryFn: billingApi.getPaymentCards });
  return { plan, invoices, cards };
}
```

**Состав вкладки после чистки — четыре блока:**

| Блок | Данные |
|---|---|
| Текущий тариф | `plan.plan_name`, `status`, `expires_at`, `max_staff` |
| Условные действия | «Улучшить тариф» при `can_upgrade` → `/dashboard/billing?plan={next_plan}` |
| Автопродление | `auto_renewal`, `notify_before_days` — `Switch` + `PATCH` |
| История платежей | 12 строк + «Показать все» + «Экспорт CSV» |

**Кнопка «Улучшить тариф» — ровно одно условие на фронте:**

```tsx
{plan.data?.can_upgrade && (
  <Button variant="primary" onClick={() => navigate(`/dashboard/billing?plan=${plan.data.next_plan}`)}>
    {t('settings:billing.upgrade', { plan: t(`settings:billing.plans.${plan.data.next_plan}`) })}
  </Button>
)}
```

Никаких `plan === 'business' || mode === 'percent'` в JSX — вся ветвистость
осталась в `_upgrade_target()` на бэке (задача 2).

**Скачивание CSV:**

```ts
const onExport = async () => {
  const blob = await billingApi.exportInvoices();     // responseType: 'blob'
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);                            // не течём памятью
};
```

Кнопка — `<Button loading={isExporting}>`; ошибка → `toast.error`.
Пустая история → кнопка `disabled` (экспортировать нечего).

## Задача 6. Страница полной истории платежей (~0:45)

**Роут:** `/dashboard/billing/payments-history`.

> ТЗ называет путь `/tariffs/payments-history`. Корневого роута
> `/tariffs` в приложении нет — тарифы живут на `/dashboard/billing`
> (`App.tsx:139`). Кладём страницу внутрь существующего дерева, чтобы не
> заводить второй вход в биллинг мимо `OwnerRoute` и пейволла.

**Файлы:** `front/src/pages/dashboard/Billing/PaymentsHistory.tsx`,
роут в `App.tsx` внутри `<OwnerRoute>`.

Таблица всех счетов: пагинация «Загрузить ещё» (`useInfiniteQuery`,
`offset += 12` — тот же паттерн, что в Клиентах), фильтр по датам,
статус-бейджи, кнопка экспорта с текущим фильтром дат
(`?date_from&date_to`).

Кнопка «Показать все» во вкладке Настроек ведёт сюда.

---

## Edge cases

| Случай | Поведение |
|---|---|
| Студия без подписки (до первой оплаты) | `GET /billing/plan` уже отдаёт `plan_name: "none"` — рисуем «Подписка не оформлена» + CTA, а не пустые поля |
| `status != "active"` (просрочена) | «Улучшить тариф» скрыта (`can_upgrade=false`), вместо неё — «Продлить» |
| История пуста | пустое состояние с текстом, кнопка экспорта `disabled` |
| `expires_at = null` | не показываем дату вместо «Invalid Date» |
| Оплата прошла в другой вкладке | `refetchOnWindowFocus` (дефолт Query) подтянет новый тариф при возврате — вебсокет ради этого не нужен |
| Экспорт > 10 000 строк | стриминг уже решает; таймаут прокси — в BACKLOG (появится при реальных объёмах) |

---

## Критерии приёмки EPIC 4

- Вкладка показывает тариф из БД; после оплаты на `/dashboard/billing`
  возврат в Настройки показывает новый тариф без F5.
- Формы карты во вкладке нет; `grep -rn "cardNumber\|cardCvc" front/src/pages/dashboard/Settings` → пусто.
- `billing_mode = "percent"` → кнопки «Улучшить тариф» нет; `"business"`
  → нет; `"pro" + "fix"` → есть и ведёт на `?plan=business`.
- CSV скачивается, открывается в Excel с читаемой кириллицей и правильной
  разбивкой по колонкам, имя файла корректное (проверить
  `expose_headers`).
- В истории ровно 12 строк; «Показать все» ведёт на
  `/dashboard/billing/payments-history`; там подгрузка работает.
- `GET /billing/invoices?limit=999999` → 422.
- ru/en, суммы с символом валюты студии; build+lint зелёные.
</content>
