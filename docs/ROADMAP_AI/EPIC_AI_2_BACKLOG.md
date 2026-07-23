# Эпик AI-2 — Настройки AI: Velora AI 3.5, язык, системный промпт от имени студии

Цель эпика простыми словами: селекты модели и языка на левой панели и
системный промпт в модалке агентов перестают быть декорацией — всё
сохраняется в БД и переживает F5 и вход с другого устройства. В списке
моделей — единственная реальная «Velora AI 3.5», остальное — честная
заглушка «Скоро появятся». Дефолтный промпт представляется именем студии
пользователя, а не словом «Velora».

Источник: аудит в `docs/ROADMAP_AI/ROADMAP.md`, п. 3.

**Важно понимать про старт:**
- Таблица `studio_ai_settings` со всеми полями уже существует
  (`back/models/ai.py:9`) — единственная миграция эпика меняет дефолт
  колонки `model`.
- Фронт-методы `aiApi.getSettings`/`updateSettings` уже написаны.
- `useAIAgent.saveConfig` сейчас — фейк (флажок `saved` на 2 секунды).
- Get-or-create настроек нужен и роутеру чата (AI-1, задача 2) — правило
  «кто первый делает — создаёт хелпер», второй переиспользует.

**Обозначения сложности:** 🟢 простая · 🟡 средняя · 🔴 сложная, делать внимательно.

---

## Обзор (для Kanban)

| Фаза | № | Задача | Кто делает | Сложность | Время |
|---|---|---|---|---|---|
| 1. Бэкенд | 1 | Схемы + GET/PATCH `/ai/settings` (get-or-create) | Бэкенд | 🟡 | 1:15 |
| 1. Бэкенд | 2 | Миграция дефолта модели → `velora-3.5` | Бэкенд | 🟢 | 0:20 |
| 2. Фронтенд | 3 | Селект «Velora AI 3.5» + «Скоро появятся», персист языка | Фронтенд | 🟡 | 1:00 |
| 2. Фронтенд | 4 | `useAIAgent` на Query + промпт в модалке | Фронтенд | 🟡 | 1:15 |

**Итого по эпику: ~3:50.**

---

## Фаза 1 — Бэкенд

### 1. Схемы + GET/PATCH `/ai/settings` · 🟡 · 1:15

**Простыми словами:** два эндпоинта настроек; первый GET создаёт строку с
дефолтами, где вместо «Velora» подставлено название студии.
**Где:** `back/schemas/ai/settings.py` (заглушка), новый
`back/routers/ai/settings.py`, регистрация в `back/routers/ai/router.py`;
зависимости из `back/dependencies.py`.

**Контракт:**

| Method | URL | Request Body | Response |
|---|---|---|---|
| GET | `/ai/settings` | — | `AISettingsRead` (get-or-create) |
| PATCH | `/ai/settings` | `AISettingsUpdate` (все поля optional) | `AISettingsRead` |

```python
from typing import Literal, Optional
from pydantic import Field
from schemas._base import BaseSchema

Tone = Literal["friendly", "formal", "neutral"]

class AISettingsRead(BaseSchema):
    model: str
    language: str
    system_prompt: Optional[str]
    tg_enabled: bool
    tg_token: Optional[str]      # None для не-owner (см. п.3 ниже)
    tg_username: Optional[str]
    tg_tone: str
    tg_max_length: int
    tg_handled_count: int
    tg_avg_rating: float
    ig_enabled: bool
    ig_token: Optional[str]      # None для не-owner
    ig_username: Optional[str]
    ig_tone: str
    ig_max_length: int
    ig_off_hours_only: bool
    ig_handled_count: int
    ig_avg_rating: float

class AISettingsUpdate(BaseSchema):
    model: Optional[Literal["velora-3.5"]] = None   # других моделей пока нет — 422 на всё чужое
    language: Optional[Literal["auto", "ru", "en", "uk"]] = None
    system_prompt: Optional[str] = Field(None, max_length=2000)
    tg_enabled: Optional[bool] = None
    tg_tone: Optional[Tone] = None
    tg_max_length: Optional[int] = Field(None, ge=50, le=4000)
    ig_enabled: Optional[bool] = None
    ig_tone: Optional[Tone] = None
    ig_max_length: Optional[int] = Field(None, ge=50, le=4000)
    ig_off_hours_only: Optional[bool] = None
    # tg_token/ig_* подключения НЕ здесь: токен TG пишет verify-эндпоинт,
    # Instagram — OAuth-callback (эпик AI-3). PATCH не даёт вписать мусор руками.
```

**Что конкретно сделать:**
1. Хелпер `get_or_create_ai_settings(db, studio) -> StudioAISettings`
   (в `back/routers/ai/settings.py`, импортируется чатом из AI-1):
   при создании `system_prompt = default_prompt(studio.name)` из
   `services/assistant.py` —
   `Ты — вежливый ассистент студии «{name}». Отвечай кратко, по делу,
   помогай клиентам с записью и вопросами об услугах.`
   # ponytail: имя студии фиксируется в тексте при создании; переименование студии не переписывает сохранённый промпт (это пользовательский текст) — при жалобах добавить кнопку «Сбросить к дефолту».
2. GET — все роли (языку/модели чата место на любой роли), но `tg_token` и
   `ig_token` в ответе занулять, если `ctx.role != 'owner'` (токены — секрет
   владельца; настройка агентов по ТЗ — owner-only).
3. PATCH — `require_role('owner')`; `exclude_unset=True`, применить только
   переданные поля, одна транзакция, вернуть полный `AISettingsRead`.
4. Серверный гейт тумблеров: `tg_enabled=true` при пустом `tg_token` в БД →
   `400 {"detail": "tg_token_required"}`; `ig_enabled=true` без валидного
   Instagram-подключения (нет `ig_token` или истёк) →
   `400 {"detail": "ig_not_connected"}` (поле `ig_token_expires_at` появится
   в AI-3 — до него проверять только наличие токена).
**Готово, когда:** в Swagger первый GET на свежей студии возвращает строку с
промптом, содержащим название студии; PATCH `{"language":"en"}` меняет только
язык; PATCH `{"model":"gpt-4o"}` → 422; PATCH `{"tg_enabled":true}` на пустом
токене → 400; под ролью trainer GET отдаёт `tg_token: null`, PATCH → 403.

### 2. Миграция дефолта модели → `velora-3.5` · 🟢 · 0:20

**Простыми словами:** в БД по умолчанию должна лежать наша модель, а не gpt-4o.
**Где:** `back/models/ai.py:15` (`default="gpt-4o"` → `default="velora-3.5"`),
новая Alembic-миграция.
**Что конкретно сделать:**
1. Поменять default в модели.
2. `alembic revision -m "ai model default velora-3.5"` — руками в миграции:
   `UPDATE studio_ai_settings SET model = 'velora-3.5' WHERE model = 'gpt-4o'`
   (данные-миграция: старых строк с чужой моделью остаться не должно, ведь
   селект их больше не покажет).
3. `alembic upgrade head`.
**Готово, когда:** в БД нет строк с `model != 'velora-3.5'`; свежая строка
создаётся сразу с `velora-3.5`.

---

## Фаза 2 — Фронтенд

### 3. Селект «Velora AI 3.5» + «Скоро появятся», персист языка · 🟡 · 1:00

**Простыми словами:** в селекте моделей — один реальный пункт и красивая
disabled-заглушка; выбор языка и модели сохраняется на сервер и
восстанавливается при входе откуда угодно.
**Где:** `front/src/pages/dashboard/AI/constants.ts` (`MODEL_OPTIONS`),
`types.ts` (`AIModel`), `components/CustomSelect.tsx`,
`components/LeftPanel.tsx`.
**Что конкретно сделать:**
1. `types.ts`: `export type AIModel = 'velora-3.5'`.
2. `constants.ts`:

```ts
export const MODEL_OPTIONS: { value: AIModel; label: string }[] = [
  { value: 'velora-3.5', label: 'Velora AI 3.5' },
];
```

3. `CustomSelect.tsx`: пропс `footerNote?: string` — некликабельная строка
   под опциями (muted-цвет, курсор default). В селекте модели передать
   `footerNote={t('ai:models.comingSoon')}` («Скоро появятся» / «Coming
   soon»). Названий несуществующих моделей не выдумывать.
4. `LeftPanel.tsx`: значения селектов — из `aiSettings` (серверных, задача 4);
   `onUpdateSettings({model})` / `({language})` → PATCH-мутация. Язык из
   `LANGUAGE_OPTIONS` остаётся (`auto/ru/en/uk` — совпадает с Literal бэка).
**Готово, когда:** смена языка переживает F5 и повторный логин; выбрать
несуществующую модель невозможно физически; заглушка видна, но не кликается.

### 4. `useAIAgent` на Query + промпт в модалке · 🟡 · 1:15

**Простыми словами:** настройки приезжают с сервера через Query-кэш,
«Сохранить» реально сохраняет (и говорит об этом тостом), системный промпт
редактируется с лимитом и счётчиком.
**Где:** `front/src/pages/dashboard/AI/hooks/useAIAgent.ts`,
`constants.ts` (`DEFAULT_AGENT_CONFIG`, `DEFAULT_AI_SETTINGS` — удалить),
`components/modals/AgentSetupModal.tsx`, `components/AgentConfigCard.tsx`.
**Что конкретно сделать:**
1. `useAIAgent`:
   - `useQuery({ queryKey: ['ai','settings'], queryFn: aiApi.getSettings, staleTime: 30_000 })`;
   - маппер серверного плоского `AISettings` (`tg_*`/`ig_*`) в текущую
     вью-структуру `{telegram, instagram, systemPrompt}` — компоненты модалки
     не переписываем; обратный маппер — для PATCH (слать только изменённые
     поля, `exclude_unset` на бэке это ценит);
   - `useMutation(aiApi.updateSettings)`: `onSuccess` →
     `setQueryData(['ai','settings'], data)` + success-тост `useToast`
     («Настройки сохранены»); `onError` → error-тост с `detail`
     (`tg_token_required` → человеческий текст); флажок `saved` и его
     `setTimeout` удалить;
   - правки полей до «Сохранить» — локальный draft-стейт модалки (как
     сейчас), в кэш не пишем до успешного PATCH.
2. `AgentSetupModal.tsx`: textarea промпта — `value` из настроек (уже с
   названием студии), `maxLength={2000}` + счётчик `1234/2000`; кнопка
   «Сохранить» дизейблится при `isPending` мутации.
3. `AgentConfigCard.tsx` (левая панель): `enabled`, `username` и статистика
   `handled_count`/`avg_rating` — из `['ai','settings']` (реальные нули —
   честно, выдуманных цифр не рисовать).
4. Тумблеры каналов на странице/в модалке шлют PATCH `{tg_enabled: …}` —
   ошибка 400 от серверного гейта показывается тостом, Switch откатывается
   (это поведение доводится инструкциями/гейтами в AI-3).
**Готово, когда:** промпт/тон/лимиты переживают F5; «Сохранить» при упавшей
сети показывает error-тост и не врёт об успехе; grep по
`DEFAULT_AGENT_CONFIG` пуст; `npm run build && npm run lint` зелёные.
