"""Плоский вид локали: путь -> строка. Массивы адресуются индексом (a.b.0)."""
import io, json, os, re, collections

# Путь от scripts/i18n/lib.py к front/src/locales — инструменты должны
# работать из любой рабочей директории, не только из front/.
SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), 'src', 'locales')
# Contract for the CRM interface. This deliberately does not mirror the
# backend's five-language outbound-message set.
INTERFACE_LANGS = (
    'en', 'ru', 'sq', 'bg', 'hr', 'cs', 'da', 'fi', 'fr', 'de', 'el', 'hu',
    'it', 'no', 'pl', 'pt', 'ro', 'sr', 'es', 'sv', 'tr', 'uk',
)
PLACEHOLDER = re.compile(r'\{\{.*?\}\}|<\d+>|</\d+>|\$t\([^)]*\)')
RICH_TAG = re.compile(r'<(/?)(\d+)>')
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


def _object_without_duplicate_keys(pairs):
    """JSON object hook that turns silent duplicate-key data loss into an error."""
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"duplicate key {key!r}")
        value[key] = item
    return value


def load(lang, ns, root=None):
    root = root or SRC
    path = os.path.join(root, lang, f'{ns}.json')
    with io.open(path, encoding='utf-8') as source:
        return json.load(source, object_pairs_hook=_object_without_duplicate_keys)


def namespaces(root=None):
    root = root or SRC
    return sorted(f[:-5] for f in os.listdir(os.path.join(root, 'en')) if f.endswith('.json'))


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


FORMAT_SUFFIX = re.compile(r'\{\{\s*([^,}]+?)\s*,[^}]*\}\}')
COUNT_PLACEHOLDER = re.compile(r'\{\{\s*count(?:\s*,[^}]*)?\s*\}\}')


def _placeholders(text):
    """Подстановки строки для сверки с en — по ИМЕНАМ, без формата.

    {{spacePlural, capitalize}} и {{spacePlural}} — одна и та же подстановка:
    формат зависит от того, где слово стоит во фразе, а это у языков разное
    («Кресла студии» открывается словом, «Studio chairs» — нет). Потерянное или
    выдуманное ИМЯ проверка по-прежнему ловит."""
    return sorted(FORMAT_SUFFIX.sub(r'{{\1}}', p) for p in PLACEHOLDER.findall(str(text)))


def _base(key):
    m = PLURAL.match(key)
    return m.group(1) if m else None


def _node_kind(value):
    if isinstance(value, dict):
        return 'object'
    if isinstance(value, list):
        return 'array'
    return 'scalar'


def _shape_problems(source, target, prefix=''):
    """Report object/array/scalar changes that flattening alone cannot see."""
    label = prefix or '<root>'
    if _node_kind(source) != _node_kind(target):
        return [f'{label}: structure is {_node_kind(target)}, expected {_node_kind(source)}']
    if isinstance(source, dict):
        problems = []
        for key, value in source.items():
            if key in target:
                next_prefix = f'{prefix}.{key}' if prefix else key
                problems.extend(_shape_problems(value, target[key], next_prefix))
        return problems
    if isinstance(source, list):
        problems = []
        for index, value in enumerate(source):
            if index < len(target):
                next_prefix = f'{prefix}.{index}' if prefix else str(index)
                problems.extend(_shape_problems(value, target[index], next_prefix))
        return problems
    return []


def _tag_problem(text):
    """Return a tag-balance diagnostic, or ``None`` for a valid tag sequence."""
    stack = []
    for match in RICH_TAG.finditer(str(text)):
        closing, tag = match.groups()
        if not closing:
            stack.append(tag)
        elif not stack or stack[-1] != tag:
            return f'unbalanced tag </{tag}>'
        else:
            stack.pop()
    if stack:
        return f'unclosed tag <{stack[-1]}>'
    return None


def check(lang, ns, flat, tree=None, root=None):
    """Сверяет набор ключей и подстановки с en. Возвращает список претензий."""
    source_tree = load('en', ns, root)
    en = flatten(source_tree)
    explicit_plural_bases = {b for b in (_base(k) for k in en) if b}
    # English may use a bare count key (``months``), while an inflected target
    # legitimately needs ``months_one``/``months_few``/… . A bare target key
    # remains a valid catch-all, but a target that chooses forms must provide
    # every form its language needs.
    implicit_plural_bases = {
        key for key, value in en.items()
        if not _base(key) and isinstance(value, str) and COUNT_PLACEHOLDER.search(value)
    }
    plural_bases = explicit_plural_bases | implicit_plural_bases
    problems = []

    if tree is not None:
        problems.extend(_shape_problems(source_tree, tree))

    # Обязательны все неплюральные ключи en. У плюральных обязателен минимум
    # _one и _other — остальные категории (few/many) язык добавляет по своей
    # грамматике: без них i18next для 3 занятий по-чешски свалился бы на en.
    required = {k for k in en if not _base(k) and k not in implicit_plural_bases}
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

    allowed = required | plural_bases | {
        f'{b}_{c}' for b in plural_bases
        for c in ('zero', 'one', 'two', 'few', 'many', 'other')
    }
    extra = set(flat) - allowed
    if extra:
        problems.append(f'лишние {len(extra)}: {sorted(extra)[:8]}')

    for k, v in flat.items():
        src = en.get(k)
        if src is None:
            src = en.get(f'{_base(k)}_other')
        if src is None:
            src = en.get(f'{_base(k)}_one')
        if src is None:
            src = en.get(_base(k))
        if src is None:
            continue
        if ns == 'finances' and re.fullmatch(r'operations\.categoryPresets\.(in|out)\.\d+\.value', k) and v != src:
            problems.append(f'{k}: immutable server category must equal English source')
        if isinstance(v, str) and '\\\n' in v and '\\\n' not in str(src):
            problems.append(f'{k}: stray backslash before line break')
        if isinstance(src, str) and src.strip() and (not isinstance(v, str) or not v.strip()):
            problems.append(f'{k}: empty translation for non-empty source')
        if _placeholders(src) != _placeholders(v):
            problems.append(f'{k}: подстановки не как в en ({PLACEHOLDER.findall(str(src))})')
        tag_problem = _tag_problem(v)
        if tag_problem:
            problems.append(f'{k}: {tag_problem}')
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
    with io.open(f'{SRC}/{lang}/{ns}.json', 'w', encoding='utf-8', newline='') as destination:
        destination.write(json.dumps(
            nest(collections.OrderedDict((k, flat[k]) for k in order), array_paths(load('en', ns))),
            ensure_ascii=False, indent=2,
        ) + '\n')
