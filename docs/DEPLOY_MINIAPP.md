# Miniapp release checks and deployment

Use the release wrapper instead of pulling into the live checkout and building its mounted `dist` directory. A failed test, skipped test, failed build, missing browser, unavailable database, or changed artifact exits nonzero before the source checkout or live miniapp changes.

## Server commands

After the reviewed change has been committed and pushed, run from the existing clean Linux checkout:

```bash
bash scripts/deploy-miniapp.sh --check origin/main
bash scripts/deploy-miniapp.sh --deploy origin/main
```

Replace `origin/main` with the actual release branch or exact commit SHA. The wrapper resolves the ref once, verifies that exact commit, and refuses divergent history, dirty source files and concurrent releases. It never commits or pushes. `--check` accepts every candidate, including CRM/admin/schema changes, but runs only the miniapp and its dependency suites. It does not certify those other modules or advance the checkout/change live services. It creates only disposable verification containers/images and retained evidence. `--deploy` refuses new CRM/admin changes and schema/model/migration/Compose changes; promotion through this wrapper remains limited to the miniapp and compatible API changes.

Miniapp checks are required before every server code update. For a front-only release, freeze a candidate SHA, run `--check` against it, and only after success fast-forward to that exact SHA and update `web`. The guarded command sequence is in the repository `DEPLOY.md`; raw `git pull && docker compose up` bypasses the required checks. Other module and migration releases need their own reviewed promotion procedure in addition to this mandatory miniapp gate.

The wrapper itself must already be installed in the server checkout for its first use. Install the reviewed wrapper and its support files through the existing release process; copying a new wrapper does not mean this release has been tested or promoted. A candidate without the complete scripts or browser suite is blocked. Test both commands in staging before adopting them on the server.

Requirements: Bash, Git, `flock`, Docker Engine and Compose v2, enough disk for the Python/Node/Chromium image, and access to package/image registries during image builds. Production `.env` values are never copied into the test source or test containers.

## What the gate checks

1. All discovered miniapp `.check.ts` files and `scripts/check-*.mjs`/`scripts/*.test.mjs` checks, with failed `console.assert` treated as an error, followed by ESLint and the production TypeScript/Vite build.
2. The backend miniapp, public, hybrid/resource booking, reservations, checkout, client subscriptions, certificates, loyalty/promo/referrals, service/staff schedule/price inputs, notification/mailer and auth/session suites, plus the HTTP/database journey, using a fresh PostgreSQL 17 container. The exact file list is retained as `backend-selection.json`. Existing pytest safeguards disable SMTP, Stripe and LLM network transports; the Docker test network has no external route. Unrelated platform billing, AI and import suites are outside this miniapp gate.
3. Mobile and desktop browser journeys against the exact production bundle, including the email code request, captured SMTP content, verification and booking lifecycle. Fixture API requests go to the isolated local test server; external requests are blocked.
4. Release barrier regressions, strict JUnit reports with executed tests and zero failures/skips, and SHA-256 hashes of every built file. Xfail/skip are not accepted as passing release evidence.
5. For backend changes, build the production API image and boot it against the isolated database before promotion. Schema/model/migration/Compose changes are refused by `--deploy`; they require a separately reviewed migration release.

The PostgreSQL container and internal network have unique run names, no production volumes, no host database port, and are removed on exit. The source export, reports and tested bundle remain in the printed temporary directory for diagnosis. Images referenced by deployed API/worker containers remain available for rollback.

The production bundle uses the same origin as the API that serves `/s/{studio_ref}`. The runner explicitly sets `VITE_API_URL` to the empty string, overriding ignored developer `.env` files and the localhost fallback. The exact resulting bytes are browser-tested and promoted. A separate public HTTPS API origin can be set through `MINIAPP_PUBLIC_API_URL` for direct local verification; changing server origin requires a reviewed public build setting forwarded into its test container. Loopback URLs and credentials in public URLs are refused.

## Promotion and rollback

After checks pass, `--deploy` checks that the checkout is still clean at the original SHA. An offline SMTP preflight verifies required configuration presence and the port without printing values. This does not test the SMTP provider, mailbox delivery or spam placement.

The wrapper saves the previous index and, for backend changes, the running API/worker image IDs. It advances Git with `--ff-only`, verifies the tested artifact again, installs hashed assets first and atomically replaces `index.html` last. Existing hashed assets are retained so previously opened pages can continue loading them. The existing bind-mounted directory stays in place.

Backend changes recreate API and worker from the already built image. The API command starts Uvicorn directly: this miniapp path never executes production migrations. The persisted image/command override is stored in `.git/miniapp-release.compose.yml`. Future service administration must include this file, or use the wrapper; a bare Compose command can choose a different image or run the Dockerfile's migration command.

The API is checked on its local root endpoint after startup. If promotion or service startup fails, the wrapper attempts to restore the previous index and API/worker image IDs and returns nonzero. The source remains at the tested candidate SHA; it does not reset Git history. Rollback failures are visible and require operator recovery from the retained evidence. This is a single-instance restart with possible brief downtime. A process crash, power loss or production-only configuration/schema difference can still require recovery; the existing stack has no traffic switch for a fully atomic backend rollout.

`.git/miniapp-release.deployed-sha` records the last successful miniapp UI/API deployment independently of Git HEAD, not the CRM/web deployment. It advances only after miniapp runtime checks pass. On first adoption the existing HEAD is used as the baseline, so the operator must confirm that the running miniapp/API corresponds to it. After a failed rollout, retrying the same candidate still compares API/schema changes with the prior successful deployment and performs the backend promotion again. A malformed or unavailable recorded commit is blocked rather than guessed. A separately checked front-only release leaves this marker unchanged: the guard against new CRM/admin changes compares the current source HEAD with the next candidate, so historical front changes do not block a subsequent miniapp/API release.

## CI enforcement and limits

The `Miniapp release gate` job in `.github/workflows/miniapp-release.yml` uses the same verifier and fresh PostgreSQL on every pull request and push. Require this job in the release branch rules, forbid bypasses for the release account, and restrict server deployment access to this reviewed wrapper. Workflow source alone cannot change GitHub branch protection or prevent an administrator from running raw `git pull`, `npm run build` or Docker commands.

This gate covers the miniapp and its API paths. It does not certify the whole CRM, real payment settlement, a live SMTP provider, or physical Safari/Instagram behavior. The full backend baseline previously had failures outside the miniapp scope; they must not be described as green because this selected gate passes. No production deployment or branch-protection changes are performed by adding these files.

## Local verification

`cd miniapp && npm run verify` uses the same sequence. Supply a fresh dedicated `TEST_DATABASE_URL`, a distinct inert `DATABASE_URL` guard value, and optionally `MINIAPP_E2E_PYTHON` and `MINIAPP_E2E_BROWSER_CHANNEL=chrome` for an installed Chrome. Python dotenv loading is disabled by the runner so local production `.env` credentials cannot override test settings. The installed Python must have both backend requirements and `requirements-dev.txt`; install Playwright Chromium with `npx playwright install chromium` if not using system Chrome.

Local verification without an exact `MINIAPP_RELEASE_SHA` produces diagnostic evidence only; the deploy wrapper accepts only artifacts tied to its exact exported commit. Docker verification is the reproducible release path.

The HTTP/browser journey fixture supplies its own `MINIAPP_URL` and CORS origin
from `MINIAPP_E2E_PREVIEW_PORT` (default `4174`). It does not need a developer's
`.env` or a Telegram bot for browser checkout returns. Regression tests exercise
both a missing inherited URL and an unrelated inherited URL and verify the
actual success/cancel destinations passed to Checkout.
