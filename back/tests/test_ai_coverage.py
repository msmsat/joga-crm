"""Полнота покрытия API инструментами ассистента (эпик AI-6, задача 13).

«ИИ знает каждую функцию» — это не абзац в документе, а вот этот тест: каждый
изменяющий эндпоинт приложения либо имеет инструмент, либо стоит ниже в UI_ONLY
с причиной, почему он оставлен интерфейсу. Иначе следующий эпик добавит десять
ручек, и про ассистента снова забудут — молча.

Цель НЕ в том, чтобы довести покрытие до 100 %: пустой UI_ONLY при сотне
инструментов хуже, чем полсотни инструментов и внятный список исключений. Цель
в том, чтобы каждое непокрытие было осознанным и его было видно.

Маршруты берутся из живого приложения (app.routes), а не регулярками по файлам:
роутер, забытый в main.py, иначе прошёл бы мимо проверки.

Запуск из back/:  pytest tests/test_ai_coverage.py -s
"""
import warnings

warnings.filterwarnings("ignore")

from main import app
from services.ai_tools import TOOLS

_METHODS = {"POST", "PATCH", "PUT", "DELETE"}

# Маршрут → почему у него НЕТ инструмента. Причина обязательна: строка «нет
# инструмента» без объяснения через полгода неотличима от забывчивости.
UI_ONLY: dict[str, str] = {
    # ── Сам ассистент: настраивать себя и отвечать за свой транспорт он не должен
    "POST /ai/actions/execute": "исполнение подтверждённого действия — это и есть кнопка человека",
    "POST /ai/sessions": "диалоги ассистента ведёт фронт, а не модель",
    "DELETE /ai/sessions/{session_id}": "удаление диалога — действие человека в списке чатов",
    "POST /ai/sessions/{session_id}/messages": "сам вход в ассистента",
    "POST /ai/sessions/{session_id}/stream": "сам вход в ассистента",
    "PATCH /ai/settings": "модель, язык и промпт ассистента меняет владелец руками",
    "PATCH /ai/messages/{message_id}/rating": "оценка ответа — мнение человека, инструментом её не поставить",
    "POST /ai/telegram/verify-token": "токен бота владелец вводит и проверяет сам",
    "DELETE /ai/telegram/token": "отключение бота — осознанное действие человека",
    "DELETE /ai/instagram/connection": "отключение Instagram — осознанное действие человека",
    "POST /ai/instagram/webhook": "вебхук Meta: контекста студии нет вовсе",
    "POST /ai/whatsapp/webhook": "вебхук WhatsApp: контекста студии нет вовсе",

    # ── Вход, регистрация, пароли: границы доверия, и все они внешние
    "POST /auth/register": "регистрация человека",
    "POST /auth/login": "вход",
    "POST /auth/login/2fa": "второй фактор",
    "POST /auth/google": "вход через Google",
    "POST /auth/verify-email": "подтверждение почты кодом",
    "POST /auth/otp/request": "одноразовый код",
    "POST /auth/otp/verify": "одноразовый код",
    "POST /auth/change-password": "смена пароля — только руками владельца пароля",
    "POST /auth/forgot-password": "восстановление пароля",
    "POST /auth/reset-password": "восстановление пароля",
    "PATCH /auth/me": "личные данные пользователя правит он сам в Профиле",
    "POST /auth/onboarding": "онбординг из 5 шагов проходит владелец",
    "POST /auth/studios": "создание новой студии",
    "POST /auth/select-studio": "переключение студии — действие интерфейса",
    "POST /auth/invite/accept": "приглашение принимает приглашённый",
    "POST /auth/invite/decline": "приглашение отклоняет приглашённый",
    "DELETE /auth/sessions/current": "выход из аккаунта",

    # ── Деньги Velora и касса: платит человек своей картой
    "POST /billing/checkout": "оплата тарифа картой",
    "POST /billing/renew": "продление тарифа",
    "POST /billing/trial": "включение пробного периода",
    "POST /billing/model": "смена модели оплаты тарифа",
    "PATCH /billing/autopay": "автосписание включает владелец сам",
    "PUT /billing/profile": "платёжные реквизиты студии",
    "POST /billing/payment-method/setup": "привязка карты",
    "POST /billing/portal": "портал Stripe",
    "POST /billing/offline-fees/pay": "оплата комиссии платформы",
    "POST /billing/invoices/{invoice_id}/refund": "возврат по счёту — деньги обратно, только руками",
    "POST /billing/invoices/{invoice_id}/sync": "служебная сверка счёта со Stripe",
    "POST /billing/webhook/stripe": "вебхук Stripe: контекста студии нет",
    "POST /checkout/calculate": "касса клиента: расчёт корзины на лету",
    "POST /checkout/confirm": "касса клиента: подтверждение оплаты",
    "POST /checkout/pay": "касса клиента: приём платежа",
    "POST /checkout/session": "касса клиента: сессия Stripe",
    "POST /checkout/webhook/stripe": "вебхук Stripe: контекста студии нет",

    # ── Клиентское мини-приложение: там действует сам клиент, ctx студии нет
    "POST /global/auth/email/request": "вход клиента в мини-приложение",
    "POST /global/auth/email/verify": "вход клиента в мини-приложение",
    "POST /global/auth/telegram": "вход клиента в мини-приложение",
    "POST /global/check-user": "проверка клиента при входе",
    "POST /global/checkout/calculate": "покупка клиентом из мини-приложения",
    "POST /global/checkout/session": "покупка клиентом из мини-приложения",
    "PATCH /global/me/settings": "настройки клиента в его кабинете",
    "POST /global/reservations": "клиент записывается сам",
    "POST /global/reservations/{lesson_id}/cancel": "клиент отменяет запись сам",
    "POST /global/reservations/{lesson_id}/coffee": "клиент выбирает кофе сам",
    "DELETE /global/reservations/{lesson_id}/coffee": "клиент выбирает кофе сам",
    "POST /global/reservations/{lesson_id}/rate": "оценку занятия ставит клиент",
    "POST /booking/public/booking/{studio_id}/reserve": "публичная запись без входа: ctx студии нет",
    "POST /booking/telegram/webhook/{token}": "вебхук бота записи: ctx студии нет",
    "PATCH /booking/channels/{channel_type}": "подключение канала записи: токен бота вводит владелец",

    # ── Журнал: правка и отметки делаются кликом по карточке занятия
    "PATCH /schedule/lessons/{lesson_id}": "перенос и правка занятия — перетаскиванием в Журнале",
    "DELETE /schedule/lessons/{lesson_id}": "удаление занятия из расписания — руками",
    "PATCH /schedule/lessons/{lesson_id}/cancel": "отмена занятия задевает всех записанных — только руками",
    "PATCH /schedule/reservations/{reservation_id}/attend": "отметка прихода — клик по клиенту в карточке занятия",
    "PATCH /schedule/reservations/{reservation_id}/confirm": "подтверждение записи — клик в карточке занятия",

    # ── Клиенты: связь с человеком, деньги и правка задним числом
    "POST /clients/{client_id}/call": "звонок клиенту — действие человека, не ассистента",
    "POST /clients/{client_id}/message": "сообщение клиенту от студии пишет человек",
    "POST /clients/{client_id}/subscription-reminder": "напоминание клиенту отправляет человек",
    "POST /clients/{client_id}/booking": "запись из карточки — у ассистента для этого book_client",
    "POST /clients/{client_id}/deposit": "пополнение депозита — приём денег в кассе",
    "POST /clients/{client_id}/subscriptions/{sub_id}/transfer": "перенос абонемента другому клиенту — деньги и договорённость",
    "PATCH /clients/{client_id}/notes/{note_id}": "правка чужой заметки администратора",
    "DELETE /clients/{client_id}/notes/{note_id}": "удаление чужой заметки администратора",
    "PATCH /clients/{client_id}/registration-date": "правка даты регистрации задним числом двигает статусы всей базы",
    "PATCH /clients/segment-rules": "пороги статусов — формула, по которой пересчитается вся база",

    # ── Сотрудники: связь и точечная правка графика
    "POST /staff/{staff_id}/call": "звонок сотруднику — действие человека",
    "POST /staff/{staff_id}/message": "сообщение сотруднику пишет человек",
    "POST /staff/{staff_id}/invite": "повторное приглашение отправляет владелец",
    "PUT /staff/{staff_id}/schedule/day": "правка одного дня графика; ассистент задаёт график целиком (set_staff_schedule)",
    "POST /staff/{staff_id}/schedule/{lesson_id}/cancel": "снятие тренера с занятия задевает записанных — руками",

    # ── Каталог: правка и удаление сущностей, фото
    "PATCH /studio/branches/{branch_id}": "правка филиала — форма с часами работы и фото",
    "DELETE /studio/branches/{branch_id}": "удаление филиала вместе с залами — руками",
    "PATCH /studio/halls/{hall_id}": "правка зала — форма с оборудованием и цветом",
    "DELETE /studio/halls/{hall_id}": "удаление зала, к которому привязаны занятия — руками",
    "DELETE /studio/services/{service_id}": "удаление услуги, на которой висят занятия — руками",
    "PATCH /catalog/subscriptions/{package_id}": "правка проданного пакета меняет условия у купивших",
    "DELETE /catalog/subscriptions/{package_id}": "снятие пакета с продажи — руками",
    "PATCH /catalog/subscriptions-config": "настройки программы абонементов (заморозка, перенос) — тумблеры владельца",
    "POST /studio/logo": "загрузка файла",
    "POST /studio/upload-logo": "загрузка файла",
    "POST /studio/upload-branch-photo": "загрузка файла",
    "POST /studio/upload-hall-photo": "загрузка файла",
    "POST /studio/upload-staff-photo": "загрузка файла",

    # ── Финансы: правка проводок, документы, зарплаты, эквайринг
    "PATCH /finances/operations/{operation_id}": "правка проведённой операции пересчитывает балансы и комиссию",
    "DELETE /finances/operations/{operation_id}": "удаление проводки — руками, с глазами на балансе",
    "PATCH /finances/accounts/{account_id}": "правка счёта, в т.ч. баланса — руками",
    "DELETE /finances/accounts/{account_id}": "удаление счёта с историей — руками",
    "PATCH /finances/counterparties/{cp_id}": "правка реквизитов контрагента",
    "DELETE /finances/counterparties/{cp_id}": "удаление контрагента со сделками",
    "POST /finances/goals": "цель ставит владелец — это его план, а не операция",
    "PATCH /finances/goals/{goal_id}": "правка цели",
    "DELETE /finances/goals/{goal_id}": "удаление цели",
    "POST /finances/documents": "документы — работа с файлами",
    "PATCH /finances/documents/{doc_id}": "документы — работа с файлами",
    "DELETE /finances/documents/{doc_id}": "документы — работа с файлами",
    "POST /finances/documents/{doc_id}/file": "загрузка файла",
    "POST /finances/gateways/stripe/connect": "подключение эквайринга — OAuth Stripe Connect",
    "PUT /finances/gateways/{gateway_type}": "реквизиты платёжного шлюза вводит владелец",
    "POST /finances/salaries/{user_id}/pay": "выплата зарплаты — деньги сотруднику, только руками",
    "DELETE /finances/salaries/{user_id}/pay": "отмена выплаты — деньги обратно, только руками",

    # ── Лояльность: настройка программ и массовые сценарии
    "PATCH /loyalty/config": "настройка программы карт — экран с уровнями и курсом баллов",
    "PUT /loyalty/levels": "уровни лояльности правятся списком целиком",
    "PATCH /loyalty/discounts": "настройка программы скидок",
    "PATCH /loyalty/certificates-config": "настройка программы сертификатов",
    "PATCH /loyalty/referral": "настройка реферальной программы",
    "POST /loyalty/certificates/{cert_id}/redeem": "погашение сертификата — момент оплаты в кассе",
    "PATCH /loyalty/offers/{offer_id}/cancel": "отзыв выданной скидки",
    "POST /loyalty/promocodes/check": "проверка промокода в кассе, а не действие",
    "PATCH /loyalty/promocodes/{promo_id}/disable": "отключение промокода",
    "POST /loyalty/scenarios": "автосценарии лояльности работают по всей базе",
    "PATCH /loyalty/scenarios/{scenario_id}": "автосценарии лояльности работают по всей базе",
    "DELETE /loyalty/scenarios/{scenario_id}": "автосценарии лояльности работают по всей базе",
    "POST /loyalty/segments/{key}/campaign": (
        "массовое изменение по фильтру: баллы или письмо всем клиентам сегмента. "
        "Решение 15 эпика — у ассистента массовых действий нет вовсе, ошибка модели "
        "умножилась бы на размер базы, а откатить её нечем"
    ),

    # ── Настройки: интеграции, безопасность, личные предпочтения
    "PATCH /settings/general": "название, контакты и адрес студии владелец правит формой",
    "PATCH /settings/appearance": "тема оформления — личное предпочтение",
    "PATCH /settings/notifications": "глобальные тумблеры каналов; точечные события — toggle_notification_event",
    "PATCH /settings/notifications/events/bulk": "пачка тумблеров сразу — массовое изменение (решение 15)",
    "PATCH /settings/notifications/me": "личные оповещения пользователя",
    "POST /settings/integrations/telegram": "подключение канала: токен вводит человек",
    "DELETE /settings/integrations/telegram": "отключение канала — осознанное действие",
    "POST /settings/integrations/whatsapp": "подключение канала: токен вводит человек",
    "DELETE /settings/integrations/whatsapp": "отключение канала — осознанное действие",
    "POST /settings/integrations/whatsapp/payment-check": "служебная проверка оплаты канала",
    "POST /settings/integrations/whatsapp/templates-sync": "служебная синхронизация шаблонов Meta",
    "POST /settings/integrations/instagram": "подключение канала: OAuth Meta",
    "PATCH /settings/integrations/google": "Google Calendar: OAuth и выбор календаря",
    "DELETE /settings/integrations/google": "отключение календаря",
    "POST /settings/integrations/google/sync": "ручная синхронизация календаря",
    "POST /settings/integrations/email/request-code": "подтверждение почты кодом",
    "POST /settings/integrations/email/verify": "подтверждение почты кодом",
    "DELETE /settings/integrations/{integration_type}": "отключение интеграции — осознанное действие",
    "PATCH /settings/security/2fa": "второй фактор включает владелец сам",
    "DELETE /settings/security/sessions": "завершение сессий",
    "DELETE /settings/security/sessions/{session_id}": "завершение сессии",
    "POST /settings/security/export-archive": "выгрузка всех данных студии",
    "POST /settings/security/wipe-data": "стирание данных студии — необратимо",
    "DELETE /settings/security/account": "удаление аккаунта — необратимо",

    # ── Дашборд
    "POST /analytics/tasks": "задачи на сегодня — личный чек-лист владельца на дашборде",
    "PATCH /analytics/tasks/{task_id}": "задачи на сегодня — личный чек-лист владельца на дашборде",
    "DELETE /analytics/tasks/{task_id}": "задачи на сегодня — личный чек-лист владельца на дашборде",
}


def _mutating_routes() -> set[str]:
    return {
        f"{method} {route.path}"
        for route in app.routes
        for method in sorted(getattr(route, "methods", set()) & _METHODS)
    }


def _coverage_line(routes: set[str], covered: set[str]) -> str:
    return (
        f"инструментов {len(TOOLS)} (изменяющих "
        f"{sum(1 for t in TOOLS.values() if t.mutating)}), "
        f"покрыто {len(covered)} из {len(routes)} изменяющих эндпоинтов, "
        f"осознанно оставлено интерфейсу {len(UI_ONLY)}"
    )


def test_every_mutating_endpoint_is_covered_or_explained():
    """Самый честный ответ на «ИИ уже всё умеет?» — число из этого теста."""
    routes = _mutating_routes()
    covered = {t.endpoint for t in TOOLS.values() if t.endpoint} & routes
    print("\nПокрытие ассистента: " + _coverage_line(routes, covered))

    forgotten = sorted(routes - covered - set(UI_ONLY))
    assert not forgotten, (
        "не покрыты инструментом и не внесены в UI_ONLY — добавьте инструмент "
        "или причину:\n  " + "\n  ".join(forgotten)
        + "\n" + _coverage_line(routes, covered)
    )


def test_declared_endpoints_exist():
    """Инструмент объявил маршрут, которого в приложении нет — значит либо
    опечатка, либо роутер переехал, а инструмент зовёт старую функцию."""
    routes = _mutating_routes()
    for tool in TOOLS.values():
        if tool.endpoint is not None:
            assert tool.endpoint in routes, (tool.name, tool.endpoint)
        # У изменяющего маршрут обязателен — иначе он молча выпадет из покрытия.
        assert not (tool.mutating and tool.endpoint is None), tool.name


def test_ui_only_has_no_stale_rows():
    """Маршрут удалили, а причина осталась — список превращается в свалку, и
    следующее непокрытие в нём утонет."""
    stale = sorted(set(UI_ONLY) - _mutating_routes())
    assert not stale, "маршрутов больше нет, уберите из UI_ONLY:\n  " + "\n  ".join(stale)
    empty = sorted(k for k, v in UI_ONLY.items() if not v.strip())
    assert not empty, "причина обязательна:\n  " + "\n  ".join(empty)


if __name__ == "__main__":
    test_every_mutating_endpoint_is_covered_or_explained()
    test_declared_endpoints_exist()
    test_ui_only_has_no_stale_rows()
    print("ALL PASS")
