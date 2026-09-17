"""Fail-closed structural verification for all CRM locale files."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib


def verify_all(root=None, languages=None):
    """Return every required-file or content error in a locale tree."""
    root = os.fspath(root or lib.SRC)
    languages = tuple(languages or lib.INTERFACE_LANGS)
    problems = []
    if not os.path.isdir(os.path.join(root, 'en')):
        return ['en/: missing required language directory']
    namespace_names = lib.namespaces(root)
    for lang in languages:
        language_dir = os.path.join(root, lang)
        if not os.path.isdir(language_dir):
            problems.append(f'{lang}/: missing required language directory')
            continue
        if lang == 'en':
            continue
        for namespace in namespace_names:
            path = os.path.join(root, lang, f'{namespace}.json')
            label = f'{lang}/{namespace}.json'
            if not os.path.isfile(path):
                problems.append(f'{label}: missing required file')
                continue
            try:
                tree = lib.load(lang, namespace, root)
                errors = lib.check(lang, namespace, lib.flatten(tree), tree=tree, root=root)
            except (OSError, ValueError) as exc:
                problems.append(f'{label}: invalid JSON ({exc})')
                continue
            problems.extend(f'{label}: {error}' for error in errors)
    return problems


def main():
    problems = verify_all()
    for problem in problems:
        print(problem)
    print('checked languages:', len(lib.INTERFACE_LANGS) - 1, '| errors:', len(problems))
    return 1 if problems else 0


if __name__ == '__main__':
    raise SystemExit(main())
