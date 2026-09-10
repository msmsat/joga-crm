"""Отчёт о готовности студии к строгому расписанию и Resource (HB-24).

ТОЛЬКО ЧТЕНИЕ. Скрипт ничего не исправляет и ничего не включает — правила
включения живут в `services/hybrid_audit.assert_can_activate` и повторно
выполняются в самой транзакции сохранения режима. Отчёт объясняет, ПОЧЕМУ
включение отклонено, но сам разрешением не является.

Запуск из back/:
    python -m scripts.hybrid_booking_audit --studio-id 42
    python -m scripts.hybrid_booking_audit --studio-id 42 --json

Выход: 0 — блокирующих находок нет; 1 — есть; 2 — неверные аргументы/нет студии.
"""
import argparse
import asyncio
import json
import sys

from database import async_session_maker
from models import Studio
from services import hybrid_audit


async def _run(studio_id: int) -> hybrid_audit.Report:
    async with async_session_maker() as db:
        studio = await db.get(Studio, studio_id)
        if studio is None:
            print(f"Студия {studio_id} не найдена", file=sys.stderr)
            raise SystemExit(2)
        return await hybrid_audit.collect(db, studio)


def _text(report: hybrid_audit.Report) -> str:
    lines = [f"Студия {report.studio_id}: режим {report.booking_mode}, "
             f"строгое расписание {'вкл' if report.strict_schedule_enabled else 'выкл'}, "
             f"индивидуальных интервалов {report.resource_lessons}"]
    if not report.findings:
        lines.append("Находок нет — конфигурация пригодна для включения.")
        return "\n".join(lines)
    grouped: dict[str, list] = {}
    for finding in report.findings:
        grouped.setdefault(finding.kind, []).append(finding)
    for kind, items in sorted(grouped.items()):
        mark = "БЛОКИРУЕТ" if kind in hybrid_audit.BLOCKING_KINDS else "внимание"
        lines.append(f"\n[{mark}] {kind} — {len(items)}")
        for finding in items[:20]:
            lines.append(f"  {json.dumps(finding.to_json(), ensure_ascii=False)}")
        if len(items) > 20:
            lines.append(f"  … ещё {len(items) - 20}")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Аудит наследия перед включением Hybrid Booking")
    parser.add_argument("--studio-id", type=int, required=True)
    parser.add_argument("--json", action="store_true", help="машиночитаемый вывод")
    args = parser.parse_args(argv)
    report = asyncio.run(_run(args.studio_id))
    print(json.dumps(report.to_json(), ensure_ascii=False, indent=2) if args.json else _text(report))
    return 1 if report.blocking else 0


if __name__ == "__main__":
    raise SystemExit(main())
