# Execution ledger

- Spec/plan reflect the user's explicit request to implement now.
- Existing edits: clients/profiles.py and Journal/booking files; left intact.
- Separate staging copy contains source only, no credentials or customer media.
- Design decision: source visits are stored as Bumpix history rather than native
  payable bookings; source completion does not establish attendance or payment.
  Future bookings require resource mapping in the CRM presentation stage.
- Native client, studio and note models create successfully on isolated SQLite.
- Existing Alembic head: c8b73b25dbaf.
- No commits: repository instructions require explicit user authorization.
- Task 1: archive tests observed RED (module absent), then GREEN; JPEG truncated
  scan and duplicate ZIP regressions added; five existing source ZIPs verified
  offline (5 source events, 1 photo), without DB/auth/source-network access.
- Task 2: native SQLite integration observed RED (models absent), then GREEN.
  Tests cover three-way updates, linking existing real-like cards, ownership,
  snapshot/photo history, resume, missing-media repair, master reuse and statuses.
- Task 3: server CLI, scoped FastAPI reads, migration and Russian instructions.
  API tests use real handlers with fake context and isolated SQLite. PostgreSQL
  migration SQL compiles offline and Alembic has one new head b96d3210e4a7.
- Ruling: Importer class with injected session factory replaces draft free
  function interface — isolates tests from database/.env and keeps media root
  explicit — cost if wrong: callers must use the documented server CLI/class.
- Final whole-change fresh-context review found four Important defects.
  All four reproduced RED and fixed GREEN: refresh collision requires mapping;
  native legacy phone aliases prevent duplicate creation; source master remaps
  apply account-wide in the client transaction; verified phones cannot be
  replaced from unverified source data. No deferred minor findings.
- Native note edits bypass Studio locking; importer locks native ClientNote
  before baseline read. Photos fully decode after header verification.
- Frontend display and native future booking activation remain the separately
  discussed CRM stage. Imported source statuses never settle native cash.
- No staging deletion: no commits were authorized; retained source and backups
  preserve a reviewable/recoverable record of this task.

- Final staged suite: 31/31 PASS after all four review repairs; command: python -m unittest discover -s tests -p test_bumpix_*.py -v. No live DB involved.

- Installed 25 task files with hash guards and original-file backups. Installed-path suite: 31/31 PASS using temporary SQLite only. Concurrent Journal/frontend edits observed after installation; never modified by this task. Production import/migration/deployment not run.
