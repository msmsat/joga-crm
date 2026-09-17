"""Печатает bcrypt-хэш пароля для ADMIN_PASSWORD_HASH в back/.env.

Запуск из back/:  python -m scripts.admin_password

Пароль спрашивается скрытым вводом и НЕ передаётся аргументом командной
строки намеренно: аргумент осел бы в истории оболочки и в списке процессов.
"""
import getpass
import sys

sys.path.insert(0, ".")

from security import pwd_context  # noqa: E402


def main() -> int:
    first = getpass.getpass("Пароль администратора: ")
    if len(first) < 12:
        print("Слишком короткий: нужно хотя бы 12 символов.")
        return 1
    if first != getpass.getpass("Повторите: "):
        print("Пароли не совпали.")
        return 1
    print()
    print("Строка для back/.env:")
    print(f"ADMIN_PASSWORD_HASH={pwd_context.hash(first)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
