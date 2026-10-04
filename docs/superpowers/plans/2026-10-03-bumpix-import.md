# Bumpix Importer Implementation Plan

> For agentic workers: use superpowers:executing-plans inline. The user's explicit
> request authorizes implementation; no additional design approval is needed.

**Goal:** Import verified Bumpix packages into a selected CRM studio without
duplicates, lost links, silent omissions or payment/notification side effects.

**Architecture:** Separate package validation, client matching, media storage and
transactional persistence. Native client/profile notes plus preserved Bumpix
history retain unknown source semantics while providing scoped read endpoints.

**Tech Stack:** Python standard library, Pillow, SQLAlchemy async, FastAPI, Alembic.

**Spec:** ../specs/2026-10-03-bumpix-import.md

## Global Constraints

- No production database or source-account access during implementation.
- Source IDs remain strings, including 1.10 versus 1.100.
- Preview by default; apply needs studio, owner and exact source account key.
- Preserve existing working tree edits; no commits/pushes.
- Historical imports do not create billing, attendance or notifications.

## Review Focus

- Windows absolute index paths remain portable after upload to Linux.
- Changed or truncated photos never publish a successful card.
- Contact conflicts and edits made after an earlier import cannot be overwritten.
- A repeated import or interruption cannot duplicate clients, events or notes.
- Private photos/read endpoints cannot expose another studio's client records.

## Task 1: Input contract and validator

Files: services/bumpix_import/archive.py, validation.py; tests/test_bumpix_archive.py.
Interface: open_export(path) context manager yields ExportSet(account_key,
fingerprint, packages); each Package exposes snapshot, snapshot_id, client_id,
path and media_bytes(record). Reject invalid ZIP paths/limits/checksums/ownership.

- [x] Write real ZIP fixtures and failing tests for source IDs, statuses, four
  media ownership cases, corrupt/foreign records and portable nested archives.
- [x] Run `python -m unittest discover -s tests -p test_bumpix_archive.py -v` RED.
- [x] Implement the above interfaces and rerun the same command GREEN.

## Task 2: Matching, schema and transactional importer

Files: models/bumpix.py, models/__init__.py, migrations/versions/*_bumpix_import.py,
services/bumpix_import/{matching,media,service}.py; tests/test_bumpix_import.py.
Interface: Importer(session_factory, storage_root).preview(export, studio_id,
owner_email, mapping) returns a plan; .apply(export, studio_id, owner_email,
account_key, mapping) returns a completion report. CLI handles source selection.

- [x] Write isolated SQLite tests using real Client/Studio/User/ClientNote models
  for preview, three source statuses, photo links, repeat, edited fields, foreign
  studio/owner, matched clients and interrupted per-client transactions.
- [x] Observe RED, implement constraints/three-way matching and persistence, GREEN.
- [x] Verify private content-addressed media and that no Lesson/Reservation/payment
  or notifications are created. Validate local bytes even on repeated imports.

## Task 3: Server command and read API

Files: scripts/import_bumpix.py; routers/clients/bumpix.py, router.py;
tests/test_bumpix_cli_migration.py, test_bumpix_api.py; docs/BUMPIX_IMPORT.md.

- [x] RED tests for offline --verify-only, missing apply scope and status-filtered
  read endpoints. Implement CLI, reports, owner checks and scoped media retrieval.
- [x] Document directory/single/portable inputs, mapping, dry-run, apply, resume,
  rollback limits and the separate CRM presentation stage; provide server commands.
- [x] Run importer suites, migration SQL/heads, Python compilation and offline
  checks of existing source ZIPs. Review the complete change, repair defects.
- [x] Install only changed/new files after checking baseline hashes of shared
  files; verify installed files and tests. Do not run the production import.
