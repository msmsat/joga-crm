import re
import unicodedata
from contact_format import to_e164


def phone_key(value):
    return re.sub(r'[^0-9]', '', str(value or ''))


def phone_keys(value):
    keys = {phone_key(value)} - {''}
    # Legacy national input follows the native CRM rule. Explicit international
    # prefixes stay intact (e.g. +852 must never be treated as a Russian trunk).
    if value and not str(value).strip().startswith('+'):
        try:
            keys.add(phone_key(to_e164(str(value))))
        except ValueError:
            pass
    return keys


def name_key(value):
    return ' '.join(unicodedata.normalize('NFKC', str(value or '')).casefold().split())


def contacts(profile):
    return set().union(*(phone_keys(profile.get(k)) for k in ('phone', 'phone2')))


def native_values(profile):
    warnings = []
    name = str(profile.get('name') or '').strip()
    if not name or len(name) > 100:
        raise ValueError('Source name is empty/longer than CRM name field; mapping to an existing client is required')
    raw_phone = str(profile.get('phone') or '').strip()
    digits = phone_key(raw_phone)
    phone = '+' + digits if raw_phone.startswith('+') and re.fullmatch('[1-9][0-9]{7,14}', digits) else None
    if raw_phone and not phone:
        warnings.append('Primary phone kept only in source profile: international format is not confirmed')
    email = str(profile.get('email') or '').strip().lower() or None
    if email and (len(email) > 255 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email)):
        email = None
        warnings.append('Invalid email kept only in source profile')
    if profile.get('birthday'):
        warnings.append('Birthday kept in source profile; source date format has not been confirmed')
    return {'name': name, 'phone': phone, 'email': email}, warnings


def candidates(profile, clients):
    result = []
    phones = contacts(profile)
    email = str(profile.get('email') or '').strip().casefold()
    name = name_key(profile.get('name'))
    for c in clients:
        if ((phones & phone_keys(c.phone))
                or (email and email == (c.email or '').strip().casefold())
                or (name and name == name_key(' '.join(p for p in (c.name, c.last_name) if p)))):
            result.append(c.id)
    return result


def shares_identity(left, right):
    email = str(left.get('email') or '').strip().casefold()
    return bool(contacts(left) & contacts(right) or (email and email == str(right.get('email') or '').strip().casefold())
                or (name_key(left.get('name')) and name_key(left.get('name')) == name_key(right.get('name'))))
