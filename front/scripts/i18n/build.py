"""Собирает локали из блочного TSV: '== <lang>' затем строки 'ключ<TAB>перевод'."""
import os, sys, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, collections

ns = sys.argv[1]
blocks, cur = collections.OrderedDict(), None
for line in io.open(sys.argv[2], encoding='utf-8'):
    line = line.rstrip('\n')
    if line.startswith('== '):
        cur = line[3:].strip()
        blocks[cur] = collections.OrderedDict()
    elif line.strip() and cur:
        k, _, v = line.partition('\t')
        # Обратная замена к dump.py: \n в TSV — это перевод строки в значении.
        blocks[cur][k] = v.replace('\\n', '\n')
for lang, flat in blocks.items():
    lib.write_ns(lang, ns, flat)
    print(f'{lang}/{ns}.json  {len(flat)} ключей')
