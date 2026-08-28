"""Fill the AURA demo studio with a credible finance history.

This is a one-off repair/enrichment for the AURA studio created by
``seed_aura_demo_studio.py``. It is idempotent: it repairs the legacy ``income``
direction on every run, but will not add the monthly demo ledger twice.

Run from the repository root:

    python back/scripts/seed_aura_demo_finances.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, func, select, update

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACK_ROOT = PROJECT_ROOT / "back"
if str(BACK_ROOT) not in sys.path:
    sys.path.insert(0, str(BACK_ROOT))

from database import async_session_maker
from models import (
    Account,
    Counterparty,
    FinDocument,
    FinancialGoal,
    Operation,
    PaymentMethodConfig,
    SalaryPayment,
    Studio,
    StudioMember,
)


STUDIO_EMAIL = "hello@auramovement-demo.cz"
MARKER = "AURA finance seed · closeout"
DEMO_GOALS = ("Выручка за август", "Резерв на новые реформеры")
DEMO_DOCUMENTS = (
    "Договор аренды · Vinohrady",
    "Счёт Meta Ads · текущий месяц",
    "Счёт за электричество · текущий месяц",
    "Акт клининга · текущий месяц",
    "Счёт за лизинг реформеров",
)


def month_start(value: date, months_back: int) -> date:
    month = value.month - months_back
    year = value.year
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def month_end(value: date) -> date:
    if value.month == 12:
        return date(value.year + 1, 1, 1) - timedelta(days=1)
    return date(value.year, value.month + 1, 1) - timedelta(days=1)


def days_between(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


async def apply() -> dict[str, int]:
    today = date.today()
    async with async_session_maker() as session:
        async with session.begin():
            studio = await session.scalar(select(Studio).where(Studio.email == STUDIO_EMAIL))
            if studio is None:
                raise RuntimeError("AURA demo studio not found. Run seed_aura_demo_studio.py first.")

            # The first version of the demo used the display value `income`.
            # The finance API deliberately recognises only in/out.
            repaired = await session.execute(
                update(Operation)
                .where(Operation.studio_id == studio.id, Operation.type == "income")
                .values(type="in")
            )

            already_seeded = await session.scalar(
                select(Operation.id).where(Operation.studio_id == studio.id, Operation.title == MARKER)
            )
            if already_seeded is not None:
                # Rebuild only the rows this script owns. This lets an improved
                # demo layout evolve without touching any manually entered data.
                await session.execute(delete(Operation).where(
                    Operation.studio_id == studio.id,
                    Operation.title.like("AURA finance seed ·%"),
                ))
                await session.execute(delete(SalaryPayment).where(
                    SalaryPayment.studio_id == studio.id,
                    SalaryPayment.note.like("AURA finance seed ·%"),
                ))
                await session.execute(delete(FinDocument).where(
                    FinDocument.studio_id == studio.id,
                    FinDocument.title.in_(DEMO_DOCUMENTS),
                ))
                await session.execute(delete(FinancialGoal).where(
                    FinancialGoal.studio_id == studio.id,
                    FinancialGoal.title.in_(DEMO_GOALS),
                ))

            accounts = (await session.execute(
                select(Account).where(Account.studio_id == studio.id).order_by(Account.id)
            )).scalars().all()
            if len(accounts) < 2:
                raise RuntimeError("AURA finance accounts are missing; re-run the main AURA seed first.")
            bank, cash = accounts[0], accounts[1]

            counterparty_specs = (
                ("AURA Properties s.r.o.", "company", "Аренда", "#8E7CC3"),
                ("Meta Ads Czech Republic", "company", "Маркетинг", "#4A86E8"),
                ("Pražská energetika", "company", "Коммунальные", "#F6B26B"),
                ("Clean & Calm", "company", "Клининг", "#93C47D"),
                ("Bookkeep Prague", "company", "Бухгалтерия", "#76A5AF"),
                ("Pilates Equipment CZ", "company", "Оборудование", "#C27BA0"),
            )
            counterparties: dict[str, Counterparty] = {}
            for name, counterparty_type, category, color in counterparty_specs:
                row = await session.scalar(
                    select(Counterparty).where(Counterparty.studio_id == studio.id, Counterparty.name == name)
                )
                if row is None:
                    row = Counterparty(
                        studio_id=studio.id,
                        name=name,
                        counterparty_type=counterparty_type,
                        category=category,
                        balance=0,
                        deals_count=0,
                        color=color,
                    )
                    session.add(row)
                row.deals_count = 0
                counterparties[name] = row
            await session.flush()

            created = 0
            # Aggregated daily sales make charts, cashflow and payment-method
            # distribution feel like a running studio rather than a test fixture.
            for sale_date in days_between(month_start(today, 2), today):
                if sale_date.weekday() == 6:  # Sunday closed
                    continue
                daily_total = 14_500 + ((sale_date.day * 719 + sale_date.month * 1_133) % 10_500)
                # Six real receipts, rather than one aggregate, keep the average
                # check honest and populate payment-method analytics naturally.
                receipt_count = 6
                base, remainder = divmod(daily_total, receipt_count)
                for receipt in range(receipt_count):
                    amount = base + (1 if receipt < remainder else 0)
                    account = cash if (sale_date.day + receipt) % 7 == 0 else bank
                    method = "cash" if account.id == cash.id else "online_card"
                    category = "Абонементы" if receipt in {0, 4} else "Разовые занятия"
                    session.add(Operation(
                        studio_id=studio.id,
                        account_id=account.id,
                        type="in",
                        title=f"AURA finance seed · sale · {sale_date.isoformat()} · {receipt + 1}",
                        amount=amount,
                        op_date=sale_date,
                        category=category,
                        method=method,
                        status="completed",
                    ))
                    created += 1

            trainers = (await session.execute(
                select(StudioMember).where(
                    StudioMember.studio_id == studio.id,
                    StudioMember.role == "trainer",
                    StudioMember.status == "active",
                ).order_by(StudioMember.id)
            )).scalars().all()

            for back in (2, 1, 0):
                start = month_start(today, back)
                end = today if back == 0 else month_start(today, back - 1) - timedelta(days=1)
                # One expense per branch keeps the rent slice transparent.
                for branch, amount in (("Vinohrady", 48_000), ("Karlín", 43_000), ("Smíchov", 38_000)):
                    session.add(Operation(
                        studio_id=studio.id,
                        account_id=bank.id,
                        counterparty_id=counterparties["AURA Properties s.r.o."].id,
                        type="out",
                        title=f"AURA finance seed · rent · {branch} · {start:%m/%Y}",
                        amount=amount,
                        op_date=start + timedelta(days=4),
                        category="Аренда",
                        method="bank_transfer",
                        status="completed",
                    ))
                    created += 1
                    counterparties["AURA Properties s.r.o."].deals_count += 1

                fixed_costs = (
                    ("Meta Ads Czech Republic", "Маркетинг", 22_000, "Реклама Meta и Instagram"),
                    ("Pražská energetika", "Коммунальные", 11_500, "Электричество и коммунальные"),
                    ("Clean & Calm", "Клининг", 8_200, "Уборка филиалов"),
                    ("Bookkeep Prague", "Бухгалтерия", 4_500, "Бухгалтерское сопровождение"),
                    ("Pilates Equipment CZ", "Оборудование", 9_900, "Лизинг и обслуживание оборудования"),
                )
                for offset, (counterparty_name, category, amount, title) in enumerate(fixed_costs, start=7):
                    session.add(Operation(
                        studio_id=studio.id,
                        account_id=bank.id,
                        counterparty_id=counterparties[counterparty_name].id,
                        type="out",
                        title=f"AURA finance seed · {title} · {start:%m/%Y}",
                        amount=amount,
                        op_date=start + timedelta(days=offset),
                        category=category,
                        method="bank_transfer",
                        status="completed",
                    ))
                    created += 1
                    counterparties[counterparty_name].deals_count += 1

                # Payroll is represented twice, as it is in a real product:
                # a payroll record for the team screen and an expense for P&L.
                for index, member in enumerate(trainers):
                    sessions = 13 + ((index * 3 + back * 2) % 12)
                    rate = int(member.rate or 650)
                    amount = sessions * rate
                    paid_at = datetime.combine(end, datetime.min.time()).replace(hour=17)
                    session.add(SalaryPayment(
                        studio_id=studio.id,
                        user_id=member.user_id,
                        period_start=start,
                        period_end=end,
                        sessions_count=sessions,
                        hours_worked=float(sessions),
                        rate_snapshot=rate,
                        rate_type_snapshot="lesson",
                        amount=amount,
                        status="paid",
                        paid_at=paid_at,
                        note="AURA finance seed · monthly trainer payout",
                    ))
                    session.add(Operation(
                        studio_id=studio.id,
                        account_id=bank.id,
                        trainer_id=member.user_id,
                        type="out",
                        title=f"AURA finance seed · trainer payout · {member.name} · {start:%m/%Y}",
                        amount=amount,
                        op_date=end,
                        category="Оплата тренерам",
                        method="bank_transfer",
                        status="completed",
                    ))
                    created += 1

            session.add(Operation(
                studio_id=studio.id,
                account_id=bank.id,
                type="out",
                title=MARKER,
                amount=0,
                op_date=today,
                category="Служебное",
                method="system",
                status="completed",
            ))
            created += 1

            document_specs = (
                ("Договор аренды · Vinohrady", "contract", counterparties["AURA Properties s.r.o."], 48_000, "signed"),
                ("Счёт Meta Ads · текущий месяц", "invoice", counterparties["Meta Ads Czech Republic"], 22_000, "paid"),
                ("Счёт за электричество · текущий месяц", "invoice", counterparties["Pražská energetika"], 11_500, "paid"),
                ("Акт клининга · текущий месяц", "act", counterparties["Clean & Calm"], 8_200, "paid"),
                ("Счёт за лизинг реформеров", "invoice", counterparties["Pilates Equipment CZ"], 9_900, "paid"),
            )
            for title, doc_type, counterparty, amount, status in document_specs:
                session.add(FinDocument(
                    studio_id=studio.id,
                    counterparty_id=counterparty.id,
                    title=title,
                    doc_type=doc_type,
                    upload_date=datetime.combine(today - timedelta(days=7), datetime.min.time()),
                    amount=amount,
                    status=status,
                    file_ext="pdf",
                    file_url=None,
                    requires_signature=doc_type == "contract",
                ))

            session.add_all([
                FinancialGoal(
                    studio_id=studio.id,
                    title="Выручка за август",
                    target_amount=450_000,
                    current_amount=398_000,
                    deadline=month_end(today),
                    category="Занятия и абонементы",
                    color="#9DBEAC",
                    priority="high",
                    tracking_mode="manual",
                    op_type="in",
                ),
                FinancialGoal(
                    studio_id=studio.id,
                    title="Резерв на новые реформеры",
                    target_amount=180_000,
                    current_amount=86_000,
                    deadline=today + timedelta(days=90),
                    category="Оборудование",
                    color="#DFA67B",
                    priority="medium",
                    tracking_mode="manual",
                    op_type="out",
                ),
            ])

            await session.flush()
            # Accounts are snapshots. Rebuild them from the actual ledger so
            # their cards agree with the P&L and operation lists.
            for account in accounts:
                incoming, outgoing = (await session.execute(
                    select(
                        func.coalesce(func.sum(Operation.amount).filter(Operation.type == "in"), 0),
                        func.coalesce(func.sum(Operation.amount).filter(Operation.type == "out"), 0),
                    ).where(Operation.studio_id == studio.id, Operation.account_id == account.id)
                )).one()
                account.balance = int(incoming) - int(outgoing)
                today_delta = await session.scalar(
                    select(func.coalesce(func.sum(Operation.amount), 0)).where(
                        Operation.studio_id == studio.id,
                        Operation.account_id == account.id,
                        Operation.op_date == today,
                        Operation.type == "in",
                    )
                )
                account.daily_change = int(today_delta or 0)

            payment_configs = (await session.execute(
                select(PaymentMethodConfig).where(PaymentMethodConfig.studio_id == studio.id)
            )).scalars().all()
            for config in payment_configs:
                method = "cash" if config.method_type == "cash" else "online_card"
                config.monthly_transactions = int(await session.scalar(
                    select(func.count()).select_from(Operation).where(
                        Operation.studio_id == studio.id,
                        Operation.method == method,
                        Operation.op_date >= month_start(today, 0),
                    )
                ) or 0)

            return {"repaired_operations": repaired.rowcount or 0, "created_operations": created}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Repair and enrich AURA demo finances.")
    parser.add_argument("--apply", action="store_true", help="write the finance ledger")
    return parser.parse_args()


async def main() -> None:
    if not parse_args().apply:
        print("No data written. Re-run with: python back/scripts/seed_aura_demo_finances.py --apply")
        return
    summary = await apply()
    print("AURA finance demo completed:")
    for key, value in summary.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    asyncio.run(main())
