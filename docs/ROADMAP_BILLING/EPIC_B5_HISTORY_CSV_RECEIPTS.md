# Epic B5 — История: серверный CSV-экспорт + гарантированный чек

**Цель:** экспорт CSV сделать серверным (аудит §5 «эндпоинт для генерации файла»),
а к **каждому** оплаченному платежу гарантировать чек (`pdf_url`).

**Зависит от:** B1 · **Блокирует:** —

**Файлы:** `back/routers/billing/router.py` (эндпоинт CSV), `back/routers/billing/webhook.py`
(генерация чека), `front/.../tabs/InvoicesTab.tsx` (кнопка → эндпоинт).

---

## Backend — CSV-эндпоинт

`GET /billing/invoices/export.csv` — стрим CSV всех счетов студии (не только загруженной
страницы, как сейчас на фронте). `require_role("owner")`, `StudioContext`.

```python
import csv, io
from fastapi.responses import StreamingResponse

@router.get("/invoices/export.csv")
async def export_invoices_csv(ctx: StudioContext = Depends(require_role("owner")),
                              db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BillingInvoice)
              .where(BillingInvoice.studio_id == ctx.studio_id)
              .order_by(BillingInvoice.id.desc()))).scalars().all()
    buf = io.StringIO()
    buf.write("﻿")  # BOM — Excel корректно читает кириллицу
    w = csv.writer(buf, delimiter=";")  # ; — RU-Excel разделитель
    w.writerow(["Дата", "Описание", "Сумма", "Метод", "Статус", "Чек"])
    for inv in rows:
        w.writerow([
            inv.paid_at.strftime("%d.%m.%Y") if inv.paid_at else "",
            inv.plan_name,
            f"{inv.amount / 100:.2f}",
            inv.payment_method or "",
            inv.status,
            inv.pdf_url or "",
        ])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="velora_invoices.csv"'})
```

`csv.writer` сам эскейпит кавычки/`;` внутри полей — устраняет баг ручной склейки
`.join(',')` в текущем `InvoicesTab.tsx:65`.

## Backend — гарантированный чек

Аудит §5: «к каждому платежу прикреплён чек». Заполняем `pdf_url` при переходе инвойса
в `paid` — в `webhook.py` (обработчик успешной оплаты Fondy). Найти место, где статус
инвойса становится `paid`, и рядом проставить чек:

```python
# в обработчике approved-платежа (webhook.py), после inv.status = "paid":
if not inv.pdf_url:
    inv.pdf_url = f"{BACKEND_URL}/billing/invoices/{inv.id}/receipt.pdf"
```

Плюс лёгкий эндпоинт генерации самого чека (или редирект на чек провайдера, если Fondy
его отдаёт — проверить `webhook.py`, там может уже быть ссылка на квитанцию):

```python
@router.get("/invoices/{invoice_id}/receipt.pdf")
async def get_receipt(invoice_id: int, ctx=Depends(require_role("owner")),
                      db: AsyncSession = Depends(get_db)):
    inv = (await db.execute(select(BillingInvoice).where(
        BillingInvoice.id == invoice_id,
        BillingInvoice.studio_id == ctx.studio_id))).scalar_one_or_none()
    if inv is None or inv.status != "paid":
        raise HTTPException(404, "Чек доступен только для оплаченных счетов")
    # ponytail: минимальный PDF-чек. Если Fondy отдаёт свою квитанцию — редиректим на неё.
    return StreamingResponse(_render_receipt_pdf(inv), media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="receipt-{inv.id}.pdf"'})
```

`_render_receipt_pdf` — минимальный PDF (проверить, есть ли уже `reportlab`/подобное в
`requirements`; если нет — **не тащить тяжёлую либу**: отдавать текстовый чек или ссылку
провайдера). Приоритет: если Fondy в вебхуке присылает `receipt_url` — сохраняем его в
`pdf_url` и вообще не генерим PDF сами.

## Frontend

`InvoicesTab.tsx` — заменить клиентскую Blob-генерацию (`:62-72`) на переход к эндпоинту:

```ts
// было: сборка CSV в браузере. стало: серверный файл.
<a href={`${API_BASE}/billing/invoices/export.csv`} download
   onClick={...} className="...">
  <DownloadIcon /> {t('exportCsv')}
</a>
```

или через `billingApi.exportCsv()` с авторизацией (если `client` шлёт Bearer в заголовке,
а не куке — качать fetch-ом с токеном → Blob → download; сохранить один хелпер, не дублировать).
Колонка «Чек» (`:102-112`): для `paid` теперь всегда `inv.pdf_url` → рендерим ссылку «PDF»;
`—` заменить на `t('empty.noData')` для не-оплаченных (B0).

`billing.api.ts`:
```ts
exportCsvUrl: () => `/billing/invoices/export.csv`,   // если качаем <a>
// либо exportCsv: () => client.getBlob('/billing/invoices/export.csv')
```

## Проверка

```
cd back && venv\Scripts\activate && python -m pytest tests/ -q -k billing
cd front && npm run build && npm run lint
```

Self-check эскейпа CSV (нетривиальная логика — кириллица + разделители):

```python
def test_csv_escapes_and_bom():
    import csv, io
    buf = io.StringIO(); buf.write("﻿")
    w = csv.writer(buf, delimiter=";"); w.writerow(["a;b", 'c"d'])
    out = buf.getvalue()
    assert out.startswith("﻿") and '"a;b"' in out and '"c""d"' in out
```

Ручной чек: «Экспорт CSV» скачивает файл со **всеми** счетами, открывается в Excel без
кракозябр; у каждого `paid`-счёта в колонке «Чек» — рабочая ссылка PDF.

> `[серверный CSV + чек по вебхуку]` → skipped: тяжёлый PDF-движок — если провайдер даёт `receipt_url`, свой рендер не нужен. Add when потребуется брендированный чек.
