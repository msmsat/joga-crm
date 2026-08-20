"""Плоский вид локали: путь -> строка. Массивы адресуются индексом (a.b.0)."""
import io, json, os, re, collections

# Путь от scripts/i18n/lib.py к front/src/locales — инструменты должны
# работать из любой рабочей директории, не только из front/.
SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), 'src', 'locales')
PLACEHOLDER = re.compile(r'\{\{.*?\}\}|<\d+>|</\d+>|\$t\([^)]*\)')
PLURAL = re.compile(r'^(.*)_(zero|one|two|few|many|other)$')


# Категории множественного числа, которые CLDR реально выдаёт для ЦЕЛЫХ чисел.
# Не выводится из данных и не угадывается — это грамматика языка, и именно её
# забывают: без _few по-чешски «3 lekce» показало бы английскую строку.
# 'other' у ru/uk отсутствует намеренно: там он достаётся только дробям (1,5),
# а счётчиков с дробями в продукте нет — существующие ru-локали так и написаны.
PLURAL_FORMS = {
    'en': ('one', 'other'),   'ru': ('one', 'few', 'many'),
    'uk': ('one', 'few', 'many'),
    'cs': ('one', 'few', 'other'),   'pl': ('one', 'few', 'many'),
    'hr': ('one', 'few', 'other'),   'sr': ('one', 'few', 'other'),
    'ro': ('one', 'few', 'other'),
    'es': ('one', 'other'),   'fr': ('one', 'other'),
    'it': ('one', 'other'),   'pt': ('one', 'other'),
    'sq': ('one', 'other'),   'bg': ('one', 'other'),
    'da': ('one', 'other'),   'de': ('one', 'other'),
    'el': ('one', 'other'),   'fi': ('one', 'other'),
    'hu': ('one', 'other'),   'no': ('one', 'other'),
    'sv': ('one', 'other'),   'tr': ('one', 'other'),
}


def flatten(node, prefix=''):
    out = collections.OrderedDict()
    if isinstance(node, dict):
        for k, v in node.items():
            out.update(flatten(v, f'{prefix}.{k}' if prefix else k))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out.update(flatten(v, f'{prefix}.{i}'))
    else:
        out[prefix] = node
    return out


def load(lang, ns):
    return json.load(io.open(f'{SRC}/{lang}/{ns}.json', encoding='utf-8'))


def namespaces():
    return sorted(f[:-5] for f in os.listdir(f'{SRC}/en') if f.endswith('.json'))


def _slot(lst, idx, default):
    while len(lst) <= idx:
        lst.append(None)
    if lst[idx] is None:
        lst[idx] = default
    return lst[idx]


def array_paths(node, prefix=''):
    """Пути, по которым в en лежит массив. По виду сегмента это не определить:
    ключи errors.403/404/500 состоят из цифр, но массивом не являются."""
    out = set()
    if isinstance(node, list):
        out.add(prefix)
        for i, v in enumerate(node):
            out |= array_paths(v, f'{prefix}.{i}')
    elif isinstance(node, dict):
        for k, v in node.items():
            out |= array_paths(v, f'{prefix}.{k}' if prefix else k)
    return out


def nest(flat, arrays):
    """Собирает вложенную структуру из плоских путей. `arrays` — пути массивов из en."""
    root = [] if '' in arrays else {}
    for path, value in flat.items():
        parts = path.split('.')
        node, walked = root, ''
        for part in parts[:-1]:
            here = f'{walked}.{part}' if walked else part
            child = [] if here in arrays else {}
            node = _slot(node, int(part), child) if isinstance(node, list) else node.setdefault(part, child)
            walked = here
        last = parts[-1]
        if isinstance(node, list):
            _slot(node, int(last), value)
        else:
            node[last] = value
    return root


def _base(key):
    m = PLURAL.match(key)
    return m.group(1) if m else None


def check(lang, ns, flat):
    """Сверяет набор ключей и подстановки с en. Возвращает список претензий."""
    en = flatten(load('en', ns))
    plural_bases = {b for b in (_base(k) for k in en) if b}
    problems = []

    # Обязательны все неплюральные ключи en. У плюральных обязателен минимум
    # _one и _other — остальные категории (few/many) язык добавляет по своей
    # грамматике: без них i18next для 3 занятий по-чешски свалился бы на en.
    required = {k for k in en if not _base(k)}
    missing = required - set(flat)
    if missing:
        problems.append(f'не хватает {len(missing)}: {sorted(missing)[:8]}')
    # Голый ключ без суффикса — законный catch-all: замерено на i18next 26,
    # при count=7 и отсутствующем _many он отдаёт именно его. Там, где en
    # держит такой ключ, недостающие категории требовать не за что.
    need = set(PLURAL_FORMS.get(lang, ('one', 'other')))
    for base in sorted(plural_bases):
        if base in flat:
            continue
        have = {PLURAL.match(k).group(2) for k in flat if _base(k) == base}
        if not need <= have:
            problems.append(f'{base}: для {lang} нужны {sorted(need)}, есть {sorted(have) or "ничего"}')

    allowed = required | {f'{b}_{c}' for b in plural_bases
                          for c in ('zero', 'one', 'two', 'few', 'many', 'other')}
    extra = set(flat) - allowed
    if extra:
        problems.append(f'лишние {len(extra)}: {sorted(extra)[:8]}')

    for k, v in flat.items():
        src = en.get(k) or en.get(f'{_base(k)}_other') or en.get(f'{_base(k)}_one')
        if src is None:
            continue
        if sorted(PLACEHOLDER.findall(str(src))) != sorted(PLACEHOLDER.findall(str(v))):
            problems.append(f'{k}: подстановки не как в en ({PLACEHOLDER.findall(str(src))})')
    return problems


def write_ns(lang, ns, flat):
    """Собирает <lang>/<ns>.json в порядке ключей en. Падает на любом расхождении."""
    problems = check(lang, ns, flat)
    if problems:
        raise SystemExit(f'{lang}/{ns}:\n  ' + '\n  '.join(problems[:12]))

    # Порядок как в en, плюральные варианты — сразу за своим _one.
    order, seen = [], set()
    for k in flatten(load('en', ns)):
        group = [k] + sorted(x for x in flat if _base(x) and _base(x) == _base(k))
        for cand in group:
            if cand in flat and cand not in seen:
                seen.add(cand)
                order.append(cand)
    order += [k for k in flat if k not in seen]

    os.makedirs(f'{SRC}/{lang}', exist_ok=True)
    io.open(f'{SRC}/{lang}/{ns}.json', 'w', encoding='utf-8', newline='').write(
        json.dumps(nest(collections.OrderedDict((k, flat[k]) for k in order),
                        array_paths(load('en', ns))),
                   ensure_ascii=False, indent=2) + '\n')
