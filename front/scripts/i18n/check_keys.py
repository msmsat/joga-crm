"""Ключ, который зовёт код, обязан существовать в локали.

`verify.py` сверяет локали МЕЖДУ СОБОЙ: все языки должны повторять набор en.
Пропущен целый класс поломок — ключ, которого нет вообще нигде: `t()` тогда
печатает человеку собственное имя ключа («lessonNotes.placeholder»), и заметить
это можно только глазами на нужном экране нужного языка.

Проверяются литералы: `t('ns:key')` и `t('key')` (неймспейс по умолчанию —
из `useTranslation('ns')` в этом же файле, иначе common). Собранные из
переменных ключи (шаблонные строки) пропускаются — их значение известно
только в рантайме.

Множественное число учитывается: язык, у которого ключ разложен на
`_one/_few/_many`, считается покрытым (грамматику проверяет verify.py).

Запуск из front/:  npm run check:keys
"""
import io, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

SRC = os.path.join(os.path.dirname(lib.SRC), '')          # front/src/
PLURAL_SUFFIXES = ('zero', 'one', 'two', 'few', 'many', 'other')

NS_RE = re.compile(r"""useTranslation\(\s*['"]([^'"]+)['"]""")
T_RE = re.compile(r"(?<![\w.])t\(\s*'([^']+)'")


def _sources():
    for root, _dirs, files in os.walk(SRC):
        if 'locales' in root:
            continue
        for name in files:
            if name.endswith(('.ts', '.tsx')):
                yield os.path.join(root, name)


def _present(tree, dotted):
    """Есть ли ключ — как строка, как список строк или как набор форм числа.

    Точка в ИМЕНИ ключа законна (`models.velora-3.5`), поэтому разрез пробуем
    со всех позиций: сначала самый глубокий путь, потом всё более длинный хвост
    как одно имя.
    """
    parts = dotted.split('.')
    for cut in range(len(parts) - 1, -1, -1):
        parent = tree
        for part in parts[:cut]:
            if not isinstance(parent, dict) or part not in parent:
                parent = None
                break
            parent = parent[part]
        if not isinstance(parent, dict):
            continue
        leaf = '.'.join(parts[cut:])
        if leaf in parent and not isinstance(parent[leaf], dict):
            return True
        if any(f'{leaf}_{form}' in parent for form in PLURAL_SUFFIXES):
            return True
    return False


def main():
    languages = [d for d in sorted(os.listdir(lib.SRC)) if os.path.isdir(os.path.join(lib.SRC, d))]
    cache = {}

    def locale(lang, ns):
        if (lang, ns) not in cache:
            path = os.path.join(lib.SRC, lang, ns + '.json')
            cache[(lang, ns)] = json.load(io.open(path, encoding='utf-8')) if os.path.isfile(path) else None
        return cache[(lang, ns)]

    problems, used = [], 0
    for path in _sources():
        source = io.open(path, encoding='utf-8').read()
        # Файл может звать useTranslation несколько раз с разными неймспейсами
        # (вложенные компоненты в одном файле) — тогда ключ без префикса
        # достоверно не отнести, и мы его не трогаем.
        declared = set(NS_RE.findall(source))
        default_ns = declared.pop() if len(declared) == 1 else None
        keys = set()
        for raw in set(T_RE.findall(source)):
            ns, sep, key = raw.partition(':')
            if sep:
                keys.add((ns, key))
            elif default_ns:
                keys.add((default_ns, raw))
        for ns, key in sorted(keys):
            used += 1
            # Неймспейс, которого нет ни в одном языке, — это опечатка в коде;
            # отсутствующий файл ОДНОГО языка ловит verify.py, здесь он шум.
            if all(locale(lang, ns) is None for lang in languages):
                problems.append(f'{os.path.relpath(path, SRC)}: неймспейса {ns} нет ни в одном языке')
                continue
            blank = [lang for lang in languages
                     if locale(lang, ns) is not None and not _present(locale(lang, ns), key)]
            if len(blank) == len(languages):
                problems.append(f'{os.path.relpath(path, SRC)}: ключа {ns}:{key} нет НИ В ОДНОМ языке')
            elif blank:
                problems.append(f'{os.path.relpath(path, SRC)}: {ns}:{key} — нет в {", ".join(blank)}')

    if problems:
        print(f'Ключи из кода разошлись с локалями ({len(problems)}):')
        for line in problems:
            print(' -', line)
        return 1
    print(f'OK: {used} ключей из кода, все есть в {len(languages)} языках')
    return 0


if __name__ == '__main__':
    sys.exit(main())
