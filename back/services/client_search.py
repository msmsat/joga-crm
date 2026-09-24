"""Общий поиск клиентов по имени и контактам без учёта регистра."""
import re

from sqlalchemy import String, cast, false, func, or_

from models import Client


def _contains(value: str) -> str:
    # Символы SQL LIKE в имени/email считаются буквальными символами.
    return '%' + value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'


def client_search_condition(search: str):
    value = search.strip()
    # Явный #ID не смешиваем с совпадениями в телефонах и Instagram.
    explicit_id = re.fullmatch(r'#\s*([0-9]+)', value)
    if explicit_id:
        digits = explicit_id.group(1).lstrip('0') or '0'
        return Client.id == int(digits) if len(digits) <= 10 and int(digits) <= 2147483647 else false()
    pattern = _contains(value)
    conditions = [column.ilike(pattern, escape='\\') for column in (
        Client.name, Client.last_name, Client.phone, Client.email, Client.city,
        cast(Client.tags, String),
        func.concat(Client.name, ' ', Client.last_name),
        func.concat(Client.last_name, ' ', Client.name),
    )]
    # Номер клиента в студии («#42» или просто «42») — единственное, что есть
    # у каждого: контакты необязательны. Точное совпадение, не «содержит»:
    # на «4» иначе выпала бы половина базы.
    client_id = re.fullmatch(r'([0-9]{1,10})', value)
    if client_id and int(client_id.group(1)) <= 2147483647:
        conditions.append(Client.id == int(client_id.group(1)))
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
