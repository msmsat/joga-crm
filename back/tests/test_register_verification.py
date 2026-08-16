"""Подтверждение почты при регистрации: тот же OTP, что и везде.

Дыра, которую это закрывает. Код подтверждения был 4-значный, из `random`, лежал в
БД ОТКРЫТЫМ ТЕКСТОМ, без срока годности и без счётчика попыток — 10 000 комбинаций
перебираются за минуты. Рядом штатное поведение: повторная регистрация на
неподтверждённый адрес перезаписывает пароль (человек забыл его, не дойдя до
подтверждения). Вместе это захват любой начатой, но не завершённой регистрации:
назначь свой пароль и подбери код.

Правильный механизм в проекте уже был — `services/otp` (6 цифр из `secrets`,
bcrypt-хэш, TTL 10 минут, 5 попыток, одноразовый, привязан к действию), им
пользуется восстановление пароля. Регистрация просто осталась на старом поле.

Инварианты:
  1. Своей генерации кода в регистрации нет вовсе — ни `random`, ни записи в
     `verification_code`.
  2. Проверка идёт через `otp.verify` с тем же действием, под которым код выдан:
     код от смены пароля не должен подтверждать почту.
  3. Отказ ОДИН на все причины — иначе ручка работает как проверялка «есть ли у
     вас аккаунт с таким адресом».
  4. Обе ручки под рейт-лимитом: счётчик попыток внутри OTP закрывает перебор
     одного кода, но не перебор через выпуск новых.

Сеть и БД не трогаем.

Запуск из back/:  python -m pytest tests/test_register_verification.py
"""
import inspect

import services.otp as otp
from routers.auth import register as R


# ─── 1. своей генерации кода больше нет ───────────────────────────────────────

def test_registration_does_not_roll_its_own_code():
    # Докстринг модуля рассказывает, ЧТО тут было, и слова «random» и
    # «verification_code» в нём законны — смотрим только на код.
    src = "".join(
        line for line in inspect.getsource(R).splitlines(keepends=True)
        if not line.lstrip().startswith("#")
    ).split('"""', 2)[-1]
    assert "random" not in src, "вернулась своя генерация кода (и снова не из secrets)"
    assert "verification_code" not in src, "код снова пишется открытым текстом в БД"
    assert "otp.issue" in src, "код выдаёт не общий механизм"


def test_verification_goes_through_the_shared_otp():
    src = inspect.getsource(R.verify_email)
    assert "otp.verify" in src
    # Скоуп действия обязателен: код, выданный под смену пароля, не должен
    # подтверждать почту — это разные подтверждения с разной ценой ошибки.
    assert "VERIFY_ACTION" in src
    assert R.VERIFY_ACTION == "verify_email"
    assert R.VERIFY_ACTION in otp._SUBJECTS, "письму с кодом нечего поставить в тему"


def test_the_shared_otp_is_actually_strong():
    """Смысл переезда — в свойствах механизма, на который переехали."""
    src = inspect.getsource(otp)
    assert "secrets.randbelow(1_000_000)" in src, "код не 6 цифр или не из secrets"
    assert "get_password_hash(code)" in src, "код лежит в БД не хэшем"
    assert otp.MAX_ATTEMPTS == 5
    assert otp.CODE_TTL.total_seconds() == 600


# ─── 2. один отказ на все причины ─────────────────────────────────────────────

def test_verify_email_does_not_leak_who_is_registered():
    """Три разных ответа («нет такого», «уже подтверждён», «неверный код») — это
    проверялка чужих адресов. В forgot-password это уже закрыто, здесь было нет."""
    src = inspect.getsource(R.verify_email)
    assert src.count("raise HTTPException") == 1, "отказ снова разный по причинам"
    assert "user is None or user.is_verified" in src


# ─── 3. рейт-лимиты ───────────────────────────────────────────────────────────

def test_both_registration_endpoints_are_rate_limited():
    """Счётчик попыток внутри OTP закрывает перебор ОДНОГО кода. Перебор через
    выпуск новых («запросил код, сжёг пять попыток, повторил») закрывает только
    лимит по IP. У регистрации он к тому же не даёт рассылать письма с нашего
    SMTP на любой адрес в неограниченном темпе."""
    for fn in (R.register, R.verify_email):
        assert "limiter.limit" in inspect.getsource(fn), fn.__name__


def test_login_is_rate_limited_too():
    """Пароль без лимита перебирается без ограничений вообще: bcrypt рассчитан на
    офлайн-перебор украденной базы, а не на живой эндпоинт."""
    from routers.auth import login as L

    for fn in (L.login, L.login_2fa):
        assert "limiter.limit" in inspect.getsource(fn), fn.__name__
        # slowapi берёт IP из параметра, который ОБЯЗАН называться `request`:
        # переименуешь — лимит молча перестанет применяться.
        assert "request: Request" in inspect.getsource(fn), fn.__name__


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
    print("register verification self-check ok")
