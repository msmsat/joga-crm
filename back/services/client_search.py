"""Общий поиск клиентов по имени и контактам без учёта регистра."""
import re

from sqlalchemy import func, or_

from models import Client


def _contains(value: str) -> str:
    # Символы SQL LIKE в имени/email считаются буквальными символами.
    return '%' + value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'


def client_search_condition(search: str):
    value = search.strip()
    pattern = _contains(value)
    conditions = [column.ilike(pattern, escape='\\') for column in (
        Client.name, Client.last_name, Client.phone, Client.email,
        func.concat(Client.name, ' ', Client.last_name),
        func.concat(Client.last_name, ' ', Client.name),
    )]
    # Ник можно вставить с @, без него или ссылкой на профиль.
    handle = re.sub(r'^(?:https?://)?(?:www\.)?instagram\.com/', '', value, flags=re.I)
    handle = handle.lstrip('@').split('?', 1)[0].split('#', 1)[0].strip('/')
    if handle:
        conditions.append(Client.instagram.ilike(_contains(handle), escape='\\'))
    # +420 (777) 123-456 и 777123456 должны находить один контакт.
    digits = re.sub(r'\D', '', value)
    if len(digits) >= 3 and re.fullmatch(r'[+\d\s().-]+', value):
        conditions.append(func.regexp_replace(Client.phone, r'\D', '', 'g').like(f'%{digits}%'))
    return or_(*conditions)
