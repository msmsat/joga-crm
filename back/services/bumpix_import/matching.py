import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
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
    raw_phone2 = str(profile.get('phone2') or '').strip()
    digits2 = phone_key(raw_phone2)
    phone2 = '+' + digits2 if raw_phone2.startswith('+') and re.fullmatch('[1-9][0-9]{7,14}', digits2) else None
    if raw_phone2 and not phone2:
        warnings.append('Secondary phone retained as text; international format is not confirmed')
    birthday = None
    raw_birthday = profile.get('birthday')
    # dialog_client_profile.php explicitly treats 1 as "not set" and formats
    # all real birthdays using moment(milliseconds).utc().
    if raw_birthday not in (None, '', 0, '0', 1, '1'):
        try:
            if isinstance(raw_birthday, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', raw_birthday):
                parsed = date.fromisoformat(raw_birthday)
            elif type(raw_birthday) is int or (isinstance(raw_birthday, str) and re.fullmatch(r'-?\d+', raw_birthday)):
                parsed = (datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=int(raw_birthday))).date()
            else:
                raise ValueError('Unsupported birthday')
            if not date(1800, 1, 1) <= parsed <= date.today():
                raise ValueError('Birthday outside valid range')
            birthday = parsed.isoformat()
        except (ValueError, OverflowError):
            warnings.append('Invalid birthday retained in original data')
    numeric = {}
    for field in ('balance', 'discount'):
        try:
            number = Decimal(str(profile.get(field) or '0'))
            if not number.is_finite():
                raise ValueError('Nonfinite amount')
            numeric[field] = format(number, 'f')
        except (ValueError, InvalidOperation):
            numeric[field] = None
            warnings.append('Invalid ' + field + ' retained in original data')
    return {'name': name, 'phone': phone, 'email': email, 'birth_date': birthday,
            'phone2': phone2 or raw_phone2 or None, 'address': str(profile.get('address') or '') or None,
            **numeric}, warnings


def native_field(value):
    """JSON-safe baseline for native typed values."""
    return value.isoformat() if isinstance(value, (date, datetime)) else value


def native_kwargs(values):
    return {k: date.fromisoformat(v) if k == 'birth_date' and v else v for k, v in values.items()}


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
