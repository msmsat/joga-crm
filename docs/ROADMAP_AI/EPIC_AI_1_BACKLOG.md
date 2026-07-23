# Эпик AI-1 — Ядро чатов: эндпоинты, useAssistant, три поверхности без моков

Цель эпика простыми словами: чат перестаёт отвечать четырьмя заготовленными
фразами и терять историю на F5. Все три точки входа — страница Velora AI,
боковой AI-дровер и AI-строка в шапке — работают с одной серверной историей:
вопрос, заданный в шапке, тут же (без перезагрузки) появляется в списке чатов
страницы. Ответ пока генерирует заглушка-сервис, но весь контракт построен
как для живой нейросети — её подключение не изменит ни одного эндпоинта.

Источник: аудит в `docs/ROADMAP_AI/ROADMAP.md`, пп. 2 и 5.

**Важно понимать про старт:**
- Таблицы `ai_chat_sessions` / `ai_chat_messages` уже существуют
  (`back/models/ai.py`) — **миграций в этом эпике нет вообще**.
- `front/src/api/ai/ai.api.ts` уже описывает почти весь нужный контракт —
  бэкенд пишется ПОД него (меняется только ответ sendMessage: пара сообщений).
- Правило ролей: чат доступен всем ролям, но сессии личные
  (`user_id == текущий пользователь`) — тренер не видит чаты владельца и
  наоборот. Данные студии в ответах появятся только с инструментами LLM
  (вне рамок) — утечки чужих данных через чат нет by design.

**Обозначения сложности:** 🟢 простая · 🟡 средняя · 🔴 сложная, делать внимательно.

---

## Обзор (для Kanban)

| Фаза | № | Задача | Кто делает | Сложность | Время |
|---|---|---|---|---|---|
| 1. Бэкенд | 1 | Pydantic-схемы чатов | Бэкенд | 🟢 | 0:30 |
| 1. Бэкенд | 2 | Роутер сессий и сообщений | Бэкенд | 🔴 | 2:00 |
| 1. Бэкенд | 3 | `services/assistant.py` — задел под LLM | Бэкенд | 🟡 | 1:00 |
| 2. Фронтенд | 4 | Синхронизация контракта `api/ai` | Фронтенд | 🟢 | 0:30 |
| 2. Фронтенд | 5 | Общий хук `useAssistant` (TanStack Query) | Фронтенд | 🔴 | 2:00 |
| 2. Фронтенд | 6 | Страница AI на реальные данные, выпил моков | Фронтенд | 🟡 | 1:15 |
| 2. Фронтенд | 7 | Дровер и AI-строка шапки на `useAssistant` | Фронтенд | 🔴 | 1:30 |

**Итого по эпику: ~8:45.**

---

## Фаза 1 — Бэкенд

### 1. Pydantic-схемы чатов · 🟢 · 0:30

**Простыми словами:** описать формы данных, которыми обмениваются фронт и бэк.
**Где:** `back/schemas/ai/chat.py` (сейчас заглушка), `back/schemas/ai/__init__.py`.
**Что конкретно сделать:**

```python
from datetime import datetime
from typing import Optional
from pydantic import Field
from schemas._base import BaseSchema

class ChatSessionCreate(BaseSchema):
    title: Optional[str] = Field(None, max_length=200)

class ChatSessionRead(BaseSchema):
    id: int
    title: str
    preview: Optional[str]
    message_count: int
    created_at: datetime
    updated_at: datetime

class ChatMessageCreate(BaseSchema):
    text: str = Field(..., min_length=1, max_length=4000)

class ChatMessageRead(BaseSchema):
    id: int
    session_id: int
    role: str          # 'user' | 'assistant'
    text: str
    created_at: datetime

class SendMessageResponse(BaseSchema):
    user: ChatMessageRead
    assistant: ChatMessageRead
```

Экспортировать всё из `back/schemas/ai/__init__.py`.
**Готово, когда:** схемы импортируются роутером, `min_length=1` режет пустые
сообщения на уровне валидации (422 от Pydantic, не 500).

### 2. Роутер сессий и сообщений · 🔴 · 2:00

**Простыми словами:** пять эндпоинтов истории чатов; тексты, авторы и времена
берутся только из БД — превью и заголовок списка вычисляются из реальных
сообщений, без выдумок.
**Зачем:** это сервер для всего эпика; фронт-контракт под него уже написан.
**Где:** `back/routers/ai/chat.py` (пустой роутер), подключение уже есть в
`back/routers/ai/router.py`; зависимости — `get_studio_context` из
`back/dependencies.py` (все роли, скоуп студии).

**Контракт (все пути — под текущий `ai.api.ts`):**

| Method | URL | Request Body | Response |
|---|---|---|---|
| GET | `/ai/sessions` | — | `list[ChatSessionRead]`, сортировка `updated_at desc` |
| POST | `/ai/sessions` | `{"title": "…"}` (optional) | `201 ChatSessionRead` (`message_count: 0`) |
| DELETE | `/ai/sessions/{id}` | — | `204`; `404` если сессия чужая/нет |
| GET | `/ai/sessions/{id}/messages` | — | `list[ChatMessageRead]`, `created_at asc` |
| POST | `/ai/sessions/{id}/messages` | `{"text": "…"}` | `SendMessageResponse` |

Пример ответа GET `/ai/sessions`:

```json
[{"id": 12, "title": "Анализ выручки за май", "preview": "Готово! Сводка по выручке…",
  "message_count": 8, "created_at": "2026-07-22T10:00:00", "updated_at": "2026-07-22T10:05:12"}]
```

**Что конкретно сделать:**
1. Каждый эндпоинт фильтрует `AIChatSession.studio_id == ctx.studio_id`
   **и** `AIChatSession.user_id == ctx.user.id` — сессии личные; промах →
   404 (не 403 — не палим существование чужих чатов).
2. `message_count` в списке — одним запросом:
   `outerjoin(AIChatMessage) + func.count().label(...)` с `group_by`
   (не N+1 по сессиям).
3. POST `/ai/sessions` без title → `title="Новый чат"` (плейсхолдер, будет
   переписан первым сообщением, см. п.4).
4. POST `/ai/sessions/{id}/messages` — сердце эпика, строго в таком порядке:
   - записать user-сообщение (`role='user'`, `text` после `.strip()`);
   - прочитать историю сессии (последние 20 сообщений) и настройки
     `StudioAISettings` (get-or-create — переиспользовать хелпер из AI-2,
     кто первый делает — тот создаёт);
   - `reply = await generate_reply(...)` (задача 3);
   - записать assistant-сообщение (`role='assistant'`);
   - обновить сессию: `preview = reply[:500]` (превью последнего сообщения —
     строго из данных); если `title == "Новый чат"` — `title = text[:40]`
     (первое сообщение); `updated_at` обновится сам (onupdate);
   - один `commit` на всё, вернуть `SendMessageResponse`.
5. DELETE — удаление сессии; сообщения снесёт `cascade="all, delete-orphan"`
   модели, отдельного запроса не нужно.
**⚠️ Подводные камни:** не коммитить user-сообщение до генерации ответа
отдельной транзакцией — при падении заглушки/LLM в истории останется вопрос
без ответа; одна транзакция на пару сообщений. `text` до записи — `.strip()`,
после него строка может стать пустой → 422 вручную.
**Готово, когда:** через Swagger (`/docs`) проходит цикл: создать сессию →
отправить 2 сообщения → GET messages возвращает 4 (user/assistant попарно) с
корректными `created_at` → GET sessions показывает `message_count: 4`, preview
= текст последнего ответа → DELETE → 204, повторный GET — 404; под вторым
пользователем той же студии список пуст.

### 3. `services/assistant.py` — задел под LLM · 🟡 · 1:00

**Простыми словами:** единственное место в проекте, которое «думает». Сейчас
возвращает честную заглушку, но говорит по OpenAI-совместимому протоколу —
когда появится сервер модели, включение = две переменные в .env.
**Зачем:** пункт 5 аудита — архитектура «как будто нейросеть уже подключена».
**Где:** новый `back/services/assistant.py`; `back/.env.example`
(+`LLM_BASE_URL=`, `+LLM_MODEL=`); рядом с образцом — `back/services/notifier.py`.
**Что конкретно сделать:**
1. Контракт сервиса:

```python
async def generate_reply(
    settings: StudioAISettings,   # model, language, system_prompt
    studio_name: str,
    history: Sequence[AIChatMessage],  # последние 20, asc
) -> str:
```

2. Внутри собрать messages OpenAI-формата (это и есть будущий payload к LLM):

```python
messages = [
    {"role": "system", "content": settings.system_prompt or default_prompt(studio_name)},
    *[{"role": m.role, "content": m.text} for m in history],
]
```

3. Если `LLM_BASE_URL` задан — `aiohttp.post(f"{base}/v1/chat/completions",
   json={"model": os.getenv("LLM_MODEL", settings.model), "messages": messages})`,
   вернуть `choices[0].message.content` (aiohttp уже в зависимостях — Fondy).
   Таймаут 60 с; ошибка/таймаут → HTTPException 503
   `detail="assistant_unavailable"` (фронт покажет тост, вопрос не потеряется —
   транзакция откатится целиком).
4. Если env пуст (сегодняшний прод) — вернуть заглушку: 2–3 варианта честного
   текста «Velora AI 3.5 подключается в ближайшем обновлении — я уже сохраняю
   ваши диалоги…» на языке `settings.language` (`auto` → язык студии
   `Studio.language`, fallback `ru`). Тексты — в словаре сервиса, не в БД.
5. `default_prompt(studio_name)` — та же функция, что использует AI-2
   (см. EPIC_AI_2, задача 1): `Ты — вежливый ассистент студии «{name}»…`.
# ponytail: история — последние 20 сообщений без суммаризации; апгрейд — когда подключится реальный LLM и упрёмся в контекст-окно.
**Готово, когда:** без env POST message возвращает локализованную заглушку;
с `LLM_BASE_URL`, указывающим на любой OpenAI-совместимый сервер (проверка —
локальная Ollama), — реальный ответ модели; код роутера при этом не меняется.

---

## Фаза 2 — Фронтенд

### 4. Синхронизация контракта `api/ai` · 🟢 · 0:30

**Простыми словами:** привести уже написанный API-слой фронта к финальному
серверному контракту.
**Где:** `front/src/api/ai/ai.types.ts`, `front/src/api/ai/ai.api.ts`.
**Что конкретно сделать:**
1. `AIChatSession` += `message_count: number`.
2. Новый тип и правка метода:

```ts
export interface SendMessageResponse {
  user: AIChatMessage
  assistant: AIChatMessage
}
// ai.api.ts
sendMessage: (sessionId: number, text: string) =>
  client.post<SendMessageResponse>(`/ai/sessions/${sessionId}/messages`, { text }),
```

3. `AISettings` — дополнить до модели БД (`tg_max_length`, `ig_max_length`,
   `tg_handled_count`, `tg_avg_rating`, `ig_handled_count`, `ig_avg_rating`):
   потребители появятся в AI-2/AI-3, но контракт закрываем одной правкой.
**Готово, когда:** `npm run build` зелёный, других правок в api-слое эпикам
AI-2/AI-3 не требуется.

### 5. Общий хук `useAssistant` (TanStack Query) · 🔴 · 2:00

**Простыми словами:** один хук-движок чата на все поверхности: история и
сообщения из кэша Query (обновления без F5), оптимистичная отправка, ошибки —
глобальным тостом.
**Зачем:** решение 1 аудита — сквозная история; три мок-движка заменяются
одним модулем.
**Где:** новый `front/src/hooks/useAssistant.ts`; образец интерфейса —
текущие `AI/hooks/useAIChat.ts` и `AIDrawer/hooks/useDrawerChat.ts`
(их внешние API — подмножество нового).
**Что конкретно сделать:**
1. Стейт сервера — только Query (никаких копий в useState):
   - `useQuery({ queryKey: ['ai','sessions'], queryFn: aiApi.getSessions, staleTime: 30_000 })`;
   - `useQuery({ queryKey: ['ai','messages', activeSessionId], queryFn: …, enabled: !!activeSessionId })`.
   Локальный стейт — только `activeSessionId` и `isThinking`.
2. `sendMessage(text)` — `useMutation` со сценарием:
   - валидация: `text.trim()` непустой, ≤ 4000 — иначе ничего не отправляем;
   - если `activeSessionId == null` → `await aiApi.createSession()` →
     `setActiveSessionId(id)` (title поставит бэк по первому сообщению);
   - `onMutate`: `cancelQueries(['ai','messages',id])`, снапшот, оптимистично
     дописать `{id: -Date.now(), role:'user', text, created_at: now}` в кэш
     сообщений, `isThinking = true`;
   - `onSuccess({user, assistant})`: заменить временное сообщение на серверное
     `user`, дописать `assistant` через `setQueryData` (визуальный
     typewriter-эффект существующих панелей сохранить — рисовать текст
     `assistant` постепенно, это чисто UI поверх уже полученных данных);
   - `onError`: откат снапшота + error-тост `useToast` (текст `detail` с бэка,
     статусы/сеть — переводом);
   - `onSettled`: `invalidateQueries(['ai','sessions'])` — превью,
     message_count и порядок списка обновятся сами, без F5.
3. `newChat()` — `setActiveSessionId(null)` (сессия создастся первым
   сообщением — пустые сессии в БД не плодим);
   `loadSession(id)` — `setActiveSessionId(id)` (сообщения подтянет query).
4. `deleteSession(id)` — мутация DELETE + `invalidateQueries(['ai','sessions'])`;
   если удалили активную — `newChat()`. Подтверждение — `ConfirmModal`
   (danger) на стороне вызывающего UI.
5. Возвращаемый интерфейс (надмножество обоих старых хуков — компоненты
   переезжают почти без правок):

```ts
{ sessions, sessionsLoading, messages, messagesLoading, isThinking,
  activeSessionId, sendMessage, newChat, loadSession, deleteSession }
```

**⚠️ Подводные камни:** ключ `['ai','messages', id]` — с `id`; при смене
сессии не подсовывать сообщения старой (enabled + placeholderData `[]`).
Двойной Enter в момент polета запроса не должен слать дубль — `isPending`
мутации блокирует отправку.
**Готово, когда:** два компонента, использующие хук одновременно (страница +
дровер), видят один и тот же список сессий из одного кэша; отправка при
упавшем бэке показывает тост и убирает оптимистичное сообщение.

### 6. Страница AI на реальные данные, выпил моков · 🟡 · 1:15

**Простыми словами:** главная витрина ИИ показывает настоящую историю из БД:
список слева — название, дата, превью; клик — реальные сообщения со временем.
**Где:** `front/src/pages/dashboard/AI/AI.tsx`, `hooks/useAIChat.ts`
(удалить), `constants.ts` (удалить `MOCK_SESSIONS`, `MOCK_AI_RESPONSES`),
`components/LeftPanel.tsx`, `components/ChatPanel.tsx`,
`components/MessageBubble.tsx`, `types.ts`.
**Что конкретно сделать:**
1. `AI.tsx`: `useAIChat()` → `useAssistant()`; `hooks/useAIChat.ts` удалить.
2. `types.ts`: локальные `Message`/`ChatSession` заменить на серверные
   `AIChatMessage`/`AIChatSession` из `api/ai` (даты — ISO-строки:
   `new Date(s.updated_at)` в местах группировки/форматирования; graceful
   fallback `s.preview ?? ''`).
3. `LeftPanel.tsx`: список из `sessions` (сортировка сервера), группировка
   по дням — по `updated_at`; на hover пункта — кнопка удаления (иконка-SVG)
   → `ConfirmModal` («Удалить чат?», danger) → `deleteSession`.
4. `ChatPanel.tsx`/`MessageBubble.tsx`: время сообщения — из `created_at`;
   индикатор `isThinking` и typewriter — как есть.
5. Пустая история — empty-state «Начните первый диалог» (не мок-список);
   `sessionsLoading` — скелетон списка (финальная полировка скелетонов —
   AI-4, здесь достаточно не показывать мок).
**Готово, когда:** F5 сохраняет историю и открытую сессию не ломает; в списке
даты/превью/счётчики — строго из БД; grep по `MOCK_` в папке `AI/` пуст.

### 7. Дровер и AI-строка шапки на `useAssistant` · 🔴 · 1:30

**Простыми словами:** боковая панель ИИ и строка «Спросите AI…» в шапке
работают с той же историей, что и страница, — сквозной чат по всему продукту.
**Где:** `front/src/components/AIDrawer/hooks/useDrawerChat.ts` (заменить),
`AIDrawer/constants.ts` (удалить `MOCK_DRAWER_*`), `AIDrawer/types.ts`,
`AIDrawer/components/{ChatView,HistoryView,MessageBubble,InputBar}.tsx`,
`front/src/components/ui/Navbar.tsx` (~56–59 — имитация).
**Что конкретно сделать:**
1. `useDrawerChat` → тонкая обёртка над `useAssistant` (сохранить
   `messagesEndRef`/`cleanup`/скролл — это UI дровера); `DrawerMessage.role
   'ai'` → привести компоненты к серверному `'assistant'` (правка в двух
   местах рендера, adapter не нужен).
2. `HistoryView` — реальные `sessions` (title/preview/updated_at),
   `loadSession` открывает сессию в `ChatView`.
3. `Navbar.tsx`: убрать setTimeout-имитацию; submit строки →
   `sendMessage(text)` из `useAssistant` (создаст новую сессию), в выпадающей
   панели рендерить `assistant`-ответ из кэша (`isThinking` — текущая
   анимация «думает»); кнопка «Продолжить в чате» → `useAIDrawer().open()` —
   дровер откроется уже с этой сессией (общий `activeSessionId`).
4. `activeSessionId` должен быть общим для трёх поверхностей — поднять его в
   `AIDrawerContext` (контекст уже есть и оборачивает layout; добавить
   `activeSessionId`/`setActiveSessionId` туда, `useAssistant` читает из
   контекста).
**⚠️ Подводные камни:** Navbar живёт вне `ToastProvider`? — нет, провайдер
оборачивает весь layout (`DashboardLayout.tsx:71`), тосты доступны. Не
дублировать отправку: панель шапки и дровер используют одну мутацию из
одного хука — рендерятся из одного кэша.
**Готово, когда:** вопрос из шапки без F5 виден как новая сессия в дровере и
на странице AI; диалог, начатый в дровере, продолжается на странице с того же
места; grep `MOCK_DRAWER` пуст; `npm run build && npm run lint` зелёные.
