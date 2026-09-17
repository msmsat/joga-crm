import os, sys, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

# TSV is a UTF-8 artifact. On Windows the inherited console can be cp1251 and
# silently corrupt common punctuation or abort on characters such as ×.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

for ns in sys.argv[1:]:
    flat = lib.flatten(lib.load('en', ns))
    print(f'#### {ns} ({len(flat)})')
    for k, v in flat.items():
        # Перевод строки внутри значения экранируется — иначе TSV разъезжается
        # на несколько строк и build.py принимает хвост за отдельные ключи.
        print(f'{k}\t{str(v)}'.replace('\n', '\\n'))
