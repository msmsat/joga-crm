"""Карта доступов: что вообще открыто НЕ владельцу.

Проверяет не поведение, а поверхность. Роли размазаны по 200+ ручкам, и дырка
заводится молча: кто-то добавит эндпоинт с `get_studio_context` вместо
`require_role("owner")` — и раздел владельца открыт всей студии. Здесь снимок
ровно тех ручек студийных роутеров, куда может попасть админ или тренер;
разошёлся с ожидаемым — тест падает, и решение «открыть» становится осознанным.

Ручки без роли не читаются, а не проходят фильтр — их немного и все перечислены.
БД не нужна: карта собирается из объекта приложения.
Запуск из back/:  python -m tests.test_rbac_matrix
"""
import warnings

warnings.filterwarnings("ignore")

from fastapi.routing import APIRoute

import main

# Роутеры данных студии. /auth и /public аудитируются отдельно — там роли нет
# по определению (вход, вебхуки, публичная запись клиента).
STUDIO_PREFIXES = (
    "/analytics", "/clients", "/staff", "/schedule", "/settings",
    "/studio", "/loyalty", "/finances", "/billing", "/booking", "/checkout", "/ai",
)

# "*studio" — ручка без require_role: пускает любую роль студии.
# "*user"   — только вошедшего, вне студии.
# "*public" — без авторизации (вебхуки, OAuth-возвраты, публичная запись).
EXPECTED: dict[tuple[str, str], tuple[str, ...]] = {
    # ── AI: чат всем ролям, агенты и настройки ассистента — владельцу (ТЗ 2.11)
    ("GET", "/ai/sessions"): ("*studio",),
    ("POST", "/ai/sessions"): ("*studio",),
    ("DELETE", "/ai/sessions/{session_id}"): ("*studio",),
    ("GET", "/ai/sessions/{session_id}/messages"): ("*studio",),
    ("POST", "/ai/sessions/{session_id}/messages"): ("*studio",),
    ("GET", "/ai/settings"): ("*studio",),          # читают все, PATCH — owner
    ("GET", "/ai/instagram/callback"): ("*public",),
    ("GET", "/ai/instagram/webhook"): ("*public",),
    ("POST", "/ai/instagram/webhook"): ("*public",),
    ("GET", "/ai/whatsapp/callback"): ("*public",),
    ("GET", "/ai/whatsapp/webhook"): ("*public",),
    ("POST", "/ai/whatsapp/webhook"): ("*public",),

    # ── Дашборд: личный срез и задачи
    ("GET", "/analytics/me"): ("owner", "admin", "trainer"),
    ("GET", "/analytics/tasks"): ("owner", "admin", "trainer"),
    ("POST", "/analytics/tasks"): ("owner", "admin", "trainer"),
    ("GET", "/analytics/tasks/assignees"): ("owner", "admin", "trainer"),
    ("PATCH", "/analytics/tasks/{task_id}"): ("owner", "admin", "trainer"),
    ("DELETE", "/analytics/tasks/{task_id}"): ("owner", "admin", "trainer"),

    # ── Клиенты: читает и тренер, но только своих (routers/clients/_scope.py);
    #    всё пишущее — owner+admin и в этот список не попадает.
    ("GET", "/clients/"): ("owner", "admin", "trainer"),
    ("GET", "/clients/count"): ("owner", "admin", "trainer"),
    ("GET", "/clients/categories"): ("owner", "admin", "trainer"),
    ("GET", "/clients/segment-rules"): ("owner", "admin", "trainer"),
    ("GET", "/clients/{client_id}"): ("owner", "admin", "trainer"),
    ("GET", "/clients/{client_id}/events"): ("owner", "admin", "trainer"),
    ("GET", "/clients/{client_id}/notes"): ("owner", "admin", "trainer"),
    ("GET", "/clients/{client_id}/activity"): ("owner", "admin", "trainer"),
    ("GET", "/clients/{client_id}/wallet"): ("owner", "admin", "trainer"),

    # ── Журнал. Роль проверяется В ТЕЛЕ ручки, а не гвардом: тренеру нужно
    #    читать свои занятия и отмечать приход, но не менять расписание.
    #    Скоуп «своё занятие» — dependencies.get_scoped_lesson.
    ("GET", "/schedule/halls"): ("*studio",),
    ("GET", "/schedule/lessons"): ("*studio",),
    ("GET", "/schedule/lessons/days"): ("*studio",),
    ("GET", "/schedule/lessons/{lesson_id}"): ("*studio",),
    ("GET", "/schedule/lessons/{lesson_id}/eligible-clients"): ("*studio",),
    ("POST", "/schedule/lessons"): ("*studio",),                       # тело: тренеру 403
    ("PATCH", "/schedule/lessons/{lesson_id}"): ("*studio",),          # тело: тренеру 403
    ("DELETE", "/schedule/lessons/{lesson_id}"): ("*studio",),         # тело: тренеру 403
    ("PATCH", "/schedule/lessons/{lesson_id}/cancel"): ("*studio",),   # тело: тренеру 403
    ("POST", "/schedule/reservations"): ("*studio",),                  # тело: тренеру 403
    ("PATCH", "/schedule/reservations/{reservation_id}/cancel"): ("*studio",),  # тело: тренеру 403
    ("PATCH", "/schedule/reservations/{reservation_id}/attend"): ("*studio",),  # тренер отмечает приход на СВОЁМ

    # ── Настройки: персональные вкладки доступны всем ролям (ТЗ 2.13)
    ("GET", "/settings/general"): ("*studio",),      # название/валюта студии — читают все, PATCH owner
    ("GET", "/settings/appearance"): ("*studio",),   # тема и язык интерфейса — личные
    ("PATCH", "/settings/appearance"): ("*studio",),
    ("GET", "/settings/notifications/me"): ("*studio",),
    ("PATCH", "/settings/notifications/me"): ("*studio",),
    ("GET", "/settings/security/sessions"): ("*studio",),
    ("DELETE", "/settings/security/sessions"): ("*studio",),
    ("DELETE", "/settings/security/sessions/{session_id}"): ("*studio",),
    ("PATCH", "/settings/security/2fa"): ("*studio",),
    ("GET", "/settings/integrations/google/callback"): ("*public",),

    # ── Журнал требует список тренеров; тренеру отдаётся только его строка.
    ("GET", "/staff/"): ("owner", "admin", "trainer"),

    # ── Логотип грузится в мастере онбординга, когда студии ещё нет.
    ("POST", "/studio/upload-logo"): ("*user",),

    # ── Вебхуки платёжек и публичная запись клиента
    ("POST", "/billing/webhook/stripe"): ("*public",),
    ("POST", "/checkout/webhook/stripe"): ("*public",),
    ("GET", "/booking/public/{studio_id}/services"): ("*public",),
    ("GET", "/booking/public/{studio_id}/slots"): ("*public",),
    ("POST", "/booking/public/booking/{studio_id}/reserve"): ("*public",),
}


def _roles_of(route: APIRoute) -> tuple[str, ...]:
    """Роли ручки: явные из require_role либо категория гварда."""
    explicit: list[tuple[str, ...]] = []
    names: set[str] = set()

    def walk(dep):
        for sub in dep.dependencies:
            allowed = getattr(sub.call, "allowed_roles", None)
            if allowed:
                explicit.append(tuple(allowed))
            names.add(getattr(sub.call, "__name__", ""))
            walk(sub)

    walk(route.dependant)
    if explicit:
        return explicit[0]
    if "get_studio_context" in names:
        return ("*studio",)
    if "get_current_user" in names:
        return ("*user",)
    return ("*public",)


def build_matrix() -> dict[tuple[str, str], tuple[str, ...]]:
    """Все ручки студийных роутеров, доступные не только владельцу."""
    matrix: dict[tuple[str, str], tuple[str, ...]] = {}
    for route in main.app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith(STUDIO_PREFIXES):
            continue
        roles = _roles_of(route)
        if "trainer" not in roles and not roles[0].startswith("*"):
            continue  # только владелец (и/или админ) — в снимок не идёт
        for method in route.methods - {"HEAD", "OPTIONS"}:
            matrix[(method, route.path)] = roles
    return matrix


def test_rbac_matrix():
    actual = build_matrix()

    unexpected = {k: v for k, v in actual.items() if k not in EXPECTED}
    assert not unexpected, (
        "Ручка стала доступна не только владельцу. Если так и задумано — впишите её "
        f"в EXPECTED с комментарием почему:\n{_fmt(unexpected)}"
    )

    gone = {k: v for k, v in EXPECTED.items() if k not in actual}
    assert not gone, f"Ручка закрылась или переехала — обновите EXPECTED:\n{_fmt(gone)}"

    changed = {k: (EXPECTED[k], v) for k, v in actual.items() if EXPECTED[k] != v}
    assert not changed, f"Набор ролей изменился (ожидалось, стало):\n{_fmt(changed)}"


def _fmt(d: dict) -> str:
    return "\n".join(f"  {m:6} {p:55} {v}" for (m, p), v in sorted(d.items()))


if __name__ == "__main__":
    test_rbac_matrix()
    print(f"OK — {len(EXPECTED)} ручек доступны не только владельцу, все ожидаемые")
