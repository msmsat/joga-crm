"""Place source contacts/categories into ordinary client fields and notes."""
from .matching import native_values


def profile_values(snapshot, *, allow_existing_name=False):
    profile = snapshot['profile']
    long_name = not str(profile.get('name') or '').strip() or len(str(profile.get('name') or '').strip()) > 100
    values, warnings = native_values(dict(profile, name='Existing client') if long_name and allow_existing_name else profile)
    if long_name and allow_existing_name:
        values.pop('name', None)
    categories = {str(c.get('0')): str(c.get('2') or '').strip()
        for c in snapshot.get('lookups', {}).get('categories', []) if isinstance(c, dict)}
    tags = []
    for category in snapshot['profile'].get('categories') or []:
        label = categories.get(str(category))
        if not label:
            raise ValueError('Source client category has no confirmed label in lookups')
        if label not in tags:
            tags.append(label)
    values['tags'] = tags
    warnings = [w.replace('kept only in source profile', 'kept in client notes for correction') for w in warnings]
    return values, warnings


def profile_note(snapshot):
    profile = snapshot['profile']
    values, _ = native_values(dict(profile, name='Profile'))
    lines = [str(profile.get('comment') or '')]
    if len(str(profile.get('name') or '').strip()) > 100:
        lines.append('Ім’я: ' + str(profile['name']))
    # An invalid contact cannot be used for delivery, but remains visible and
    # editable in a regular note instead of disappearing into private snapshots.
    for field, label in (('phone', 'Телефон'), ('email', 'Email'), ('birthday', 'Дата народження')):
        value = profile.get(field)
        target = 'birth_date' if field == 'birthday' else field
        if value not in (None, '', 0, '0', 1, '1') and not values.get(target):
            lines.append(f'{label}: {value}')
    return '\n\n'.join(line for line in lines if line)
