"""Приглашение сотрудника в студию по email (Сотрудники → «Добавить сотрудника»).

Ссылка — не строка в БД, а подписанный JWT с `typ: "invite"`. Поэтому нечего
хранить, чистить и мигрировать: приглашение протухает само через INVITE_TTL_DAYS,
а отозвать его владелец может, удалив сотрудника — без `StudioMember` ссылка
мертва (см. routers/auth/invite.py).

`typ` в токене обязателен: без него invite-токен прошёл бы в `get_current_user`
как обычная сессия и ссылка из письма стала бы полноценным входом в аккаунт.
"""
import logging
import os

from jose import JWTError, jwt

from models import Studio, User
from security import ALGORITHM, SECRET_KEY, create_access_token
from services.mailer import send_email

logger = logging.getLogger(__name__)

WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")
INVITE_TTL_DAYS = 7


# ─── ТОКЕН ────────────────────────────────────────────────────────────────────

def build_invite_url(email: str, studio_id: int) -> str:
    token = create_access_token(
        data={"sub": email, "studio_id": studio_id, "typ": "invite"},
        expires_minutes=INVITE_TTL_DAYS * 24 * 60,
    )
    return f"{WEB_APP_URL}/join?token={token}"


def decode_invite(token: str) -> tuple[str, int]:
    """(email, studio_id) из ссылки-приглашения. Порча подписи, чужой `typ` или
    истёкший срок — одинаковый ValueError: расписывать причину приглашённому
    незачем, а атакующему — вредно."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise ValueError("invalid invite token")
    if payload.get("typ") != "invite" or not payload.get("sub") or not payload.get("studio_id"):
        raise ValueError("invalid invite token")
    return str(payload["sub"]), int(payload["studio_id"])


# ─── ПИСЬМО ───────────────────────────────────────────────────────────────────

_STRINGS = {
    "ru": {
        "subject": "{studio} приглашает вас в команду",
        "preheader": "Ваш доступ в CRM студии {studio}",
        "hello": "Здравствуйте, {name}!",
        "lead_new": "Вас приглашают в команду студии <b>{studio}</b> как <b>{role}</b>. "
                    "Чтобы принять приглашение, нажмите кнопку ниже и введите пароль, который вам передал руководитель. "
                    "В этом письме пароля нет и быть не может — так одной лишь ссылки для доступа недостаточно.",
        "lead_existing": "Вас приглашают в команду студии <b>{studio}</b> как <b>{role}</b>. "
                         "Чтобы принять, войдите паролем от своего аккаунта Velora — студия появится в списке ваших рабочих пространств.",
        "cta_new": "Принять приглашение",
        "cta_existing": "Принять приглашение",
        "role_label": "Роль",
        "studio_label": "Студия",
        "expires": "Ссылка действует {days} дней. Если кнопка не открывается, скопируйте адрес в браузер:",
        "ignore": "Не ждали приглашения? Ничего делать не нужно: без вашего согласия доступ к студии "
                  "не откроется. На странице приглашения есть кнопка «Отклонить» — она снимет приглашение сразу.",
    },
    "en": {
        "subject": "{studio} invites you to the team",
        "preheader": "Your access to {studio} CRM",
        "hello": "Hi {name}!",
        "lead_new": "You are invited to join <b>{studio}</b> as <b>{role}</b>. "
                    "To accept, click the button below and enter the password your manager gave you. "
                    "This email does not contain the password — that way the link alone is not enough to get in.",
        "lead_existing": "You are invited to join <b>{studio}</b> as <b>{role}</b>. "
                         "To accept, sign in with your Velora account password — the studio will appear in your workspaces.",
        "cta_new": "Accept invitation",
        "cta_existing": "Accept invitation",
        "role_label": "Role",
        "studio_label": "Studio",
        "expires": "The link is valid for {days} days. If the button does not work, paste this address into your browser:",
        "ignore": "Not expecting an invitation? You do not have to do anything — nobody gets access to the studio "
                  "without your consent. The invitation page also has a Decline button that removes it right away.",
    },
}

_ROLE_NAMES = {
    "ru": {"owner": "Владелец", "admin": "Администратор", "trainer": "Тренер"},
    "en": {"owner": "Owner", "admin": "Administrator", "trainer": "Trainer"},
}


def _render(s: dict, *, name: str, studio: str, role: str, url: str, is_new_account: bool) -> str:
    lead = (s["lead_new"] if is_new_account else s["lead_existing"]).format(studio=studio, role=role)
    cta = s["cta_new"] if is_new_account else s["cta_existing"]
    # Вёрстка письма — таблицами и инлайновыми стилями: Gmail и Outlook вырезают
    # <style> и не понимают flex/grid, а внешние картинки режут по умолчанию,
    # поэтому логотип — текстом, акцент — фоном ячейки.
    return f"""\
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{s["preheader"].format(studio=studio)}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FDFCFB;padding:40px 16px;font-family:'Manrope','Segoe UI',Arial,sans-serif">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px -4px rgba(26,26,26,0.06)">
      <tr><td style="height:4px;background:linear-gradient(90deg,#FCAE91,#F9A08B)"></td></tr>
      <tr><td style="padding:36px 40px 8px">
        <div style="font-size:19px;font-weight:800;color:#1A1A1A;letter-spacing:-0.4px">Velora</div>
      </td></tr>
      <tr><td style="padding:16px 40px 0">
        <h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;font-weight:800;color:#1A1A1A;letter-spacing:-0.6px">{s["hello"].format(name=name)}</h1>
        <p style="margin:0;font-size:15px;line-height:1.65;color:#666666">{lead}</p>
      </td></tr>
      <tr><td style="padding:24px 40px 0">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDFCFB;border:1px solid rgba(26,26,26,0.06);border-radius:14px">
          <tr>
            <td style="padding:16px 20px;font-size:12px;color:#999999">{s["studio_label"]}<div style="margin-top:3px;font-size:15px;font-weight:700;color:#1A1A1A">{studio}</div></td>
            <td style="padding:16px 20px;font-size:12px;color:#999999">{s["role_label"]}<div style="margin-top:3px;font-size:15px;font-weight:700;color:#1A1A1A">{role}</div></td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:28px 40px 0" align="center">
        <table cellpadding="0" cellspacing="0"><tr>
          <td align="center" style="background:#F9A08B;border-radius:12px">
            <a href="{url}" style="display:inline-block;padding:15px 34px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none">{cta}</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 40px 36px">
        <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#999999">{s["expires"].format(days=INVITE_TTL_DAYS)}</p>
        <p style="margin:0 0 18px;font-size:11px;line-height:1.5;color:#BBBBBB;word-break:break-all">{url}</p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#BBBBBB;border-top:1px solid #F0EDE8;padding-top:16px">{s["ignore"]}</p>
      </td></tr>
    </table>
  </td></tr>
</table>"""


async def send_invite(user: User, studio: Studio, role: str, *, name: str) -> str:
    """Шлёт приглашение и возвращает ссылку (её же показываем владельцу в модалке,
    чтобы передать сотруднику руками, если письмо не дошло).

    `name` — как человека зовут В ЭТОЙ студии (studio_members.name), а не личное
    имя аккаунта: письмо зовёт его именно в эту команду.

    Сбой SMTP не валит создание сотрудника: человек в студию уже добавлен, и
    откатывать это из-за почты нельзя — ссылку владелец видит в интерфейсе.
    """
    url = build_invite_url(user.email, studio.id)
    lang = (studio.language or "ru").lower()[:2]
    s = _STRINGS.get(lang, _STRINGS["ru"])
    role_name = _ROLE_NAMES.get(lang, _ROLE_NAMES["ru"]).get(role, role)

    try:
        await send_email(
            user.email,
            s["subject"].format(studio=studio.name),
            _render(
                s,
                name=name,
                studio=studio.name,
                role=role_name,
                url=url,
                # Непроверенный аккаунт = человека в продукте раньше не было:
                # его завела эта же студия, и пароль ему задал владелец.
                is_new_account=not user.is_verified,
            ),
        )
    except Exception:
        logger.exception("Не удалось отправить приглашение на %s", user.email)

    return url
