import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, os
langs = sorted(d for d in os.listdir(lib.SRC) if os.path.isdir(f'{lib.SRC}/{d}'))
bad = 0
for lang in langs:
    if lang == 'en':
        continue
    for ns in lib.namespaces():
        p = f'{lib.SRC}/{lang}/{ns}.json'
        if not os.path.exists(p):
            continue
        problems = lib.check(lang, ns, lib.flatten(lib.load(lang, ns)))
        if problems:
            bad += 1
            print(f'{lang}/{ns}:', problems[0])
print('проверено языков:', len(langs) - 1, '| файлов с расхождениями:', bad)
