"""Общий генератор CSV-экспортов (эпик 4 задача 4) — переиспользует и эпик 7.

Три вещи, на которых экспорт обычно ломается, решены тут раз и навсегда:
BOM (иначе Excel ест кириллицу), `;` вместо `,` (ru-локаль Excel не видит
запятую разделителем), и ленивая генерация — файл не собирается в памяти
целиком, отдаём чанк за чанком через StreamingResponse.
"""
import csv
import io
from typing import Iterable, Iterator


def _flush(buf: io.StringIO) -> str:
    data = buf.getvalue()
    buf.seek(0)
    buf.truncate(0)
    return data


def csv_stream(header: list[str], rows: Iterable[Iterable]) -> Iterator[str]:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    yield "﻿"  # BOM
    writer.writerow(header)
    yield _flush(buf)
    for row in rows:
        writer.writerow(row)
        yield _flush(buf)


if __name__ == "__main__":
    out = "".join(csv_stream(["a;b", 'c"d'], [["1", "2"]]))
    assert out.startswith("﻿")
    assert '"a;b"' in out and '"c""d"' in out  # экранирование `;` и кавычек
    assert "1;2" in out
    print("exporter self-check ok")
