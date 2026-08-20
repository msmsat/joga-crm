import os, sys, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
for ns in sys.argv[1:]:
    flat = lib.flatten(lib.load('en', ns))
    print(f'#### {ns} ({len(flat)})')
    for k, v in flat.items():
        # Перевод строки внутри значения экранируется — иначе TSV разъезжается
        # на несколько строк и build.py принимает хвост за отдельные ключи.
        print(f'{k}\t{str(v)}'.replace('\n', '\\n'))
