"""Единый OTP-механизм (EPIC 5, задача 3): смена пароля, danger zone, 2FA.

Один код на пользователя, скоуп — action: подтверждение, выданное под
"change_password", не сработает для "delete_account". Код хранится хэшем
(bcrypt, как пароль) — дамп БД не даёт возможности подтвердить чужое действие.
"""
import secrets
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from models import User
from security import get_password_hash, verify_password
from services.email_layout import code_block, greeting
from services.i18n import pick
from services.mailer import send_email
from services.members import user_lang

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5

_SUBJECTS = {
    "verify_email": {"ru": "Код подтверждения Velora", "en": "Velora verification code",
                     "uk": "Код підтвердження Velora", "cs": "Ověřovací kód Velora",
                     "de": "Velora Bestätigungscode"},
    "change_password": {"ru": "Код для смены пароля Velora", "en": "Velora password change code",
                        "uk": "Код для зміни пароля Velora", "cs": "Kód pro změnu hesla Velora",
                        "de": "Velora Code zur Passwortänderung"},
    "reset_password": {"ru": "Код восстановления пароля Velora", "en": "Velora password reset code",
                       "uk": "Код відновлення пароля Velora", "cs": "Kód pro obnovení hesla Velora",
                       "de": "Velora Code zum Zurücksetzen des Passworts"},
    "delete_data": {"ru": "Код для очистки данных студии Velora",
                    "en": "Velora studio data deletion code",
                    "uk": "Код для очищення даних студії Velora",
                    "cs": "Kód pro vymazání dat studia Velora",
                    "de": "Velora Code zum Löschen der Studiodaten"},
    "delete_account": {"ru": "Код для удаления студии Velora", "en": "Velora studio deletion code",
                       "uk": "Код для видалення студії Velora", "cs": "Kód pro smazání studia Velora",
                       "de": "Velora Code zum Löschen des Studios"},
    "enable_2fa": {"ru": "Код для включения двухфакторной аутентификации Velora",
                   "en": "Velora two-factor authentication code",
                   "uk": "Код для увімкнення двофакторної автентифікації Velora",
                   "cs": "Kód pro zapnutí dvoufaktorového ověření Velora",
                   "de": "Velora Code für die Zwei-Faktor-Authentifizierung"},
    "login_2fa": {"ru": "Код входа Velora", "en": "Velora login code",
                  "uk": "Код входу Velora", "cs": "Přihlašovací kód Velora",
                  "de": "Velora Anmeldecode"},
}

# Что именно подтверждает код. «Введите код подтверждения» — письмо, по которому
# нельзя понять, что подтверждаешь; человек, получивший его неожиданно, обязан
# увидеть в первой строке, что кто-то пытается сделать с его аккаунтом.
_PURPOSE = {
    "verify_email": {"ru": "подтвердить адрес почты", "en": "confirm your email address",
                     "uk": "підтвердити адресу пошти", "cs": "potvrdit e-mailovou adresu",
                     "de": "Ihre E-Mail-Adresse bestätigen"},
    "change_password": {"ru": "сменить пароль", "en": "change the password",
                        "uk": "змінити пароль", "cs": "změnit heslo",
                        "de": "das Passwort ändern"},
    "reset_password": {"ru": "задать новый пароль", "en": "set a new password",
                       "uk": "задати новий пароль", "cs": "nastavit nové heslo",
                       "de": "ein neues Passwort setzen"},
    "delete_data": {"ru": "удалить все данные студии", "en": "delete all studio data",
                    "uk": "видалити всі дані студії", "cs": "smazat všechna data studia",
                    "de": "alle Studiodaten löschen"},
    "delete_account": {"ru": "удалить студию", "en": "delete the studio",
                       "uk": "видалити студію", "cs": "smazat studio",
                       "de": "das Studio löschen"},
    "enable_2fa": {"ru": "включить вход по коду", "en": "enable code-based login",
                   "uk": "увімкнути вхід за кодом", "cs": "zapnout přihlášení kódem",
                   "de": "die Anmeldung per Code aktivieren"},
    "login_2fa": {"ru": "войти в аккаунт", "en": "sign in to the account",
                  "uk": "увійти в акаунт", "cs": "přihlásit se k účtu",
                  "de": "sich im Konto anmelden"},
}

_PURPOSE_FALLBACK = {"ru": "подтвердить действие", "en": "confirm the action",
                     "uk": "підтвердити дію", "cs": "potvrdit akci",
                     "de": "die Aktion bestätigen"}

# Тело письма. {purpose} — что именно подтверждают, {code} — блок с кодом,
# {minutes} — сколько он живёт, {warning} — предупреждение о необратимости.
_BODY = {
    "ru": ("<p>Кто-то запросил код, чтобы <b style=\"color:#1A1A1A\">{purpose}</b>. "
           "Если это вы — введите его на открытой странице.</p>{code}"
           "<p>Код действует {minutes} минут и сгорает после первого верного ввода. "
           "Мы никогда не спрашиваем его в переписке — если код просят прислать, "
           "это не мы.</p>{warning}"
           "<p>Запроса не было? Ничего делать не нужно: без кода действие не "
           "выполнится. Но пароль в таком случае лучше сменить.</p>"),
    "en": ("<p>Someone requested a code to <b style=\"color:#1A1A1A\">{purpose}</b>. "
           "If that was you, enter it on the page you have open.</p>{code}"
           "<p>The code is valid for {minutes} minutes and burns after the first correct "
           "entry. We never ask for it in chat — if someone asks you to send it, "
           "it is not us.</p>{warning}"
           "<p>Didn't request it? You don't have to do anything: without the code "
           "nothing happens. Still, changing your password is a good idea.</p>"),
    "uk": ("<p>Хтось запросив код, щоб <b style=\"color:#1A1A1A\">{purpose}</b>. "
           "Якщо це ви — введіть його на відкритій сторінці.</p>{code}"
           "<p>Код діє {minutes} хвилин і згорає після першого правильного введення. "
           "Ми ніколи не питаємо його в переписці — якщо код просять надіслати, "
           "це не ми.</p>{warning}"
           "<p>Запиту не було? Нічого робити не потрібно: без коду дія не "
           "виконається. Але пароль у такому разі краще змінити.</p>"),
    "cs": ("<p>Někdo si vyžádal kód, aby mohl <b style=\"color:#1A1A1A\">{purpose}</b>. "
           "Pokud jste to vy, zadejte ho na otevřené stránce.</p>{code}"
           "<p>Kód platí {minutes} minut a po prvním správném zadání propadá. "
           "Nikdy si o něj nepíšeme — pokud vás někdo žádá, ať mu kód pošlete, "
           "nejsme to my.</p>{warning}"
           "<p>Nic jste nežádali? Nemusíte dělat nic: bez kódu se akce neprovede. "
           "Heslo je ale v takovém případě lepší změnit.</p>"),
    "de": ("<p>Jemand hat einen Code angefordert, um <b style=\"color:#1A1A1A\">{purpose}</b>. "
           "Wenn Sie das waren, geben Sie ihn auf der geöffneten Seite ein.</p>{code}"
           "<p>Der Code gilt {minutes} Minuten und verfällt nach der ersten korrekten "
           "Eingabe. Wir fragen ihn nie im Chat ab — wenn jemand darum bittet, "
           "sind wir das nicht.</p>{warning}"
           "<p>Sie haben nichts angefordert? Dann müssen Sie nichts tun: ohne Code "
           "passiert nichts. Das Passwort zu ändern ist trotzdem ratsam.</p>"),
}

_DANGER_NOTE = {
    "ru": "<p>Действие необратимо: восстановить удалённое мы не сможем — "
          "ни по просьбе, ни из резервной копии.</p>",
    "en": "<p>This cannot be undone: we won't be able to restore the deleted data — "
          "not on request, not from a backup.</p>",
    "uk": "<p>Дія незворотна: відновити видалене ми не зможемо — "
          "ані на прохання, ані з резервної копії.</p>",
    "cs": "<p>Akce je nevratná: smazaná data už neobnovíme — "
          "ani na požádání, ani ze zálohy.</p>",
    "de": "<p>Der Vorgang ist unumkehrbar: Gelöschtes können wir nicht "
          "wiederherstellen — weder auf Anfrage noch aus einem Backup.</p>",
}

# Необратимое действие — предупреждение отдельным блоком, а не строкой в тексте.
_DANGER = {"delete_data", "delete_account"}


async def issue(db: AsyncSession, user: User, action: str) -> None:
    code = f"{secrets.randbelow(1_000_000):06d}"  # secrets, не random
    user.otp_code_hash = get_password_hash(code)
    user.otp_action = action
    user.otp_expires_at = datetime.utcnow() + CODE_TTL
    user.otp_attempts = 0
    await db.commit()
    lang = await user_lang(db, user)
    subject = pick(_SUBJECTS.get(action) or _SUBJECTS["verify_email"], lang)
    purpose = pick(_PURPOSE[action], lang) if action in _PURPOSE else pick(_PURPOSE_FALLBACK, lang)
    await send_email(
        user.email, subject,
        pick(_BODY, lang).format(
            purpose=purpose,
            code=code_block(code),
            minutes=int(CODE_TTL.total_seconds() // 60),
            warning=pick(_DANGER_NOTE, lang) if action in _DANGER else "",
        ),
        greeting=greeting(user.name, lang),
        lang=lang,
    )


async def verify(db: AsyncSession, user: User, action: str, code: str) -> bool:
    if user.otp_action != action or not user.otp_expires_at or datetime.utcnow() > user.otp_expires_at:
        return False
    if user.otp_attempts >= MAX_ATTEMPTS:
        return False  # брутфорс 6 цифр закрыт
    user.otp_attempts += 1
    ok = verify_password(code, user.otp_code_hash or "")
    if ok:
        user.otp_code_hash = None
        user.otp_action = None
        user.otp_expires_at = None  # одноразовость
    await db.commit()
    return ok
