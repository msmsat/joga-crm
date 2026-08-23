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
from services.email_layout import FONT, INK, button
from services.i18n import LANGS, pick, resolve
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

    "uk": {
        "subject": "{studio} запрошує вас до команди",
        "hello": "Вітаємо, {name}!",
        "lead_new": "Вас запрошують до команди студії <b>{studio}</b> як <b>{role}</b>. "
                    "Щоб прийняти запрошення, натисніть кнопку нижче та введіть пароль, який вам передав керівник. "
                    "У цьому листі пароля немає й бути не може — тож самого лише посилання для доступу замало.",
        "lead_existing": "Вас запрошують до команди студії <b>{studio}</b> як <b>{role}</b>. "
                         "Щоб прийняти, увійдіть паролем від свого акаунта Velora — студія з'явиться у списку ваших робочих просторів.",
        "cta_new": "Прийняти запрошення",
        "cta_existing": "Прийняти запрошення",
        "role_label": "Роль",
        "studio_label": "Студія",
        "expires": "Посилання діє {days} днів. Якщо кнопка не відкривається, скопіюйте адресу в браузер:",
        "ignore": "Не чекали на запрошення? Нічого робити не потрібно: без вашої згоди доступ до студії "
                  "не відкриється. На сторінці запрошення є кнопка «Відхилити» — вона зніме запрошення одразу.",
    },
    "cs": {
        "subject": "{studio} vás zve do týmu",
        "hello": "Dobrý den, {name}!",
        "lead_new": "Zveme vás do týmu studia <b>{studio}</b> na pozici <b>{role}</b>. "
                    "Pozvánku přijmete tlačítkem níže — zadejte heslo, které vám předal vedoucí. "
                    "Heslo v tomto e-mailu není a ani být nemůže: samotný odkaz tedy k přístupu nestačí.",
        "lead_existing": "Zveme vás do týmu studia <b>{studio}</b> na pozici <b>{role}</b>. "
                         "Pro přijetí se přihlaste heslem ke svému účtu Velora — studio se objeví v seznamu vašich pracovních prostorů.",
        "cta_new": "Přijmout pozvánku",
        "cta_existing": "Přijmout pozvánku",
        "role_label": "Role",
        "studio_label": "Studio",
        "expires": "Odkaz platí {days} dní. Pokud tlačítko nefunguje, vložte adresu do prohlížeče:",
        "ignore": "Pozvánku jste nečekali? Nemusíte dělat nic: bez vašeho souhlasu se přístup do studia "
                  "neotevře. Na stránce pozvánky je i tlačítko «Odmítnout» — pozvánku zruší okamžitě.",
    },
    "de": {
        "subject": "{studio} lädt Sie ins Team ein",
        "hello": "Hallo {name}!",
        "lead_new": "Sie werden ins Team des Studios <b>{studio}</b> als <b>{role}</b> eingeladen. "
                    "Klicken Sie zum Annehmen auf die Schaltfläche unten und geben Sie das Passwort ein, das Sie von der Leitung erhalten haben. "
                    "Das Passwort steht nicht in dieser E-Mail — der Link allein genügt also nicht für den Zugang.",
        "lead_existing": "Sie werden ins Team des Studios <b>{studio}</b> als <b>{role}</b> eingeladen. "
                         "Melden Sie sich zum Annehmen mit dem Passwort Ihres Velora-Kontos an — das Studio erscheint dann in Ihren Arbeitsbereichen.",
        "cta_new": "Einladung annehmen",
        "cta_existing": "Einladung annehmen",
        "role_label": "Rolle",
        "studio_label": "Studio",
        "expires": "Der Link gilt {days} Tage. Falls die Schaltfläche nicht funktioniert, kopieren Sie die Adresse in den Browser:",
        "ignore": "Sie haben keine Einladung erwartet? Dann müssen Sie nichts tun: ohne Ihre Zustimmung wird "
                  "kein Zugang eröffnet. Auf der Einladungsseite gibt es zudem «Ablehnen» — das entfernt sie sofort.",
    },
}

_ROLE_NAMES = {
    "ru": {"owner": "Владелец", "admin": "Администратор", "trainer": "Тренер"},
    "en": {"owner": "Owner", "admin": "Administrator", "trainer": "Trainer"},
    "uk": {"owner": "Власник", "admin": "Адміністратор", "trainer": "Тренер"},
    "cs": {"owner": "Vlastník", "admin": "Administrátor", "trainer": "Lektor"},
    "de": {"owner": "Inhaber", "admin": "Administrator", "trainer": "Trainer"},
}


def _render(s: dict, *, name: str, studio: str, role: str, url: str, is_new_account: bool) -> str:
    """Тело приглашения. Шапку, подвал и саму «карточку» письма ставит общая
    оболочка (services/email_layout.wrap) — здесь только то, что отличает это
    письмо от остальных: карточка «студия и роль» и кнопка приглашения."""
    lead = (s["lead_new"] if is_new_account else s["lead_existing"]).format(studio=studio, role=role)
    cta = s["cta_new"] if is_new_account else s["cta_existing"]
    return f"""\
<h1 style="margin:0 0 10px;font:800 24px/1.25 {FONT};letter-spacing:-0.6px;color:{INK}">{s["hello"].format(name=name)}</h1>
<p style="margin:0;font:400 15px/1.65 {FONT};color:#666666">{lead}</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;background:#FDFCFB;border:1px solid rgba(26,26,26,0.06);border-radius:14px">
  <tr>
    <td style="padding:16px 20px;font-size:12px;color:#999999">{s["studio_label"]}<div style="margin-top:3px;font-size:15px;font-weight:700;color:{INK}">{studio}</div></td>
    <td style="padding:16px 20px;font-size:12px;color:#999999">{s["role_label"]}<div style="margin-top:3px;font-size:15px;font-weight:700;color:{INK}">{role}</div></td>
  </tr>
</table>
{button(cta, url)}
<p style="margin:22px 0 8px;font:400 12px/1.6 {FONT};color:#999999">{s["expires"].format(days=INVITE_TTL_DAYS)}</p>
<p style="margin:0 0 18px;font:400 11px/1.5 {FONT};color:#BBBBBB;word-break:break-all">{url}</p>
<p style="margin:0;font:400 12px/1.6 {FONT};color:#BBBBBB">{s["ignore"]}</p>"""


async def send_invite(user: User, studio: Studio, role: str, *, name: str) -> str:
    """Шлёт приглашение и возвращает ссылку (её же показываем владельцу в модалке,
    чтобы передать сотруднику руками, если письмо не дошло).

    `name` — как человека зовут В ЭТОЙ студии (studio_members.name), а не личное
    имя аккаунта: письмо зовёт его именно в эту команду.

    Сбой SMTP не валит создание сотрудника: человек в студию уже добавлен, и
    откатывать это из-за почты нельзя — ссылку владелец видит в интерфейсе.
    """
    url = build_invite_url(user.email, studio.id)
    lang = resolve(studio.language)
    s = pick(_STRINGS, lang)
    role_name = pick(_ROLE_NAMES, lang).get(role, role)

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
            lang=lang,
        )
    except Exception:
        logger.exception("Не удалось отправить приглашение на %s", user.email)

    return url
