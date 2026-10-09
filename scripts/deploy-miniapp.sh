#!/usr/bin/env bash
# Tests run from an exact exported commit before touching the live checkout.
set -Eeuo pipefail

die() { printf '%s\n' "Release blocked: $*" >&2; exit 1; }
[[ $# == 2 && ( $1 == --check || $1 == --deploy ) ]] || die 'usage: bash scripts/deploy-miniapp.sh --check|--deploy REF'
mode=$1
ref=$2
[[ $ref =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || die 'invalid Git ref'
for command in git docker flock tar mktemp; do command -v "$command" >/dev/null || die "$command is required"; done
repo=$(git rev-parse --show-toplevel)
cd "$repo"
git_dir=$(git rev-parse --absolute-git-dir)
exec 9>"$git_dir/miniapp-release.lock"
flock -n 9 || die 'another release is running'
[[ -z $(git status --porcelain) ]] || die 'checkout contains local changes; preserve them before releasing'
git symbolic-ref --quiet --short HEAD >/dev/null || die 'release checkout must be on a branch'
before=$(git rev-parse HEAD)
deployed_marker="$git_dir/miniapp-release.deployed-sha"
deployed_sha=$before
if [[ -f $deployed_marker ]]; then
  read -r deployed_sha <"$deployed_marker"
  [[ $deployed_sha =~ ^[a-f0-9]{40}$ ]] || die 'invalid durable deployed SHA; reconcile runtime before releasing'
  git cat-file -e "$deployed_sha^{commit}" || die 'durable deployed commit is unavailable'
fi
git fetch --prune origin
sha=$(git rev-parse --verify "$ref^{commit}")
[[ $sha =~ ^[a-f0-9]{40}$ ]] || die 'candidate is not an exact commit SHA'
git merge-base --is-ancestor "$before" "$sha" || die 'candidate does not fast-forward the current checkout'
git merge-base --is-ancestor "$deployed_sha" "$sha" || die 'candidate diverges from the last successful runtime deployment'

# Verification covers miniapp behavior for every candidate. Promotion through
# this wrapper remains limited to the miniapp/API; CRM/admin use their own path.
if [[ $mode == --deploy ]]; then
  git diff --quiet "$before" "$sha" -- front admin || die 'candidate also changes CRM/admin; use its reviewed release path after miniapp checks'
  git diff --quiet "$deployed_sha" "$sha" -- back/migrations back/models back/models.py docker-compose.yml || \
    die 'candidate changes schema/migrations/Compose; use a reviewed migration release, never this no-migrations wrapper'
fi
backend_changed=false
if ! git diff --quiet "$deployed_sha" "$sha" -- back docker-compose.yml; then backend_changed=true; fi

temporary=$(mktemp -d "${TMPDIR:-/tmp}/joga-miniapp-release.XXXXXXXX")
run_id="joga-miniapp-$(date +%s)-$$"
network="$run_id-net"
database="$run_id-db"
canary="$run_id-canary"
test_image="$run_id-tests"
api_image="$run_id-api"
candidate="$temporary/candidate"
evidence="$temporary/evidence"
mkdir -p "$candidate" "$evidence"
cleanup() {
  docker rm -f "$canary" >/dev/null 2>&1 || true
  docker rm -f "$database" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$test_image" >/dev/null 2>&1 || true
  # Keep evidence and the exact source export after failures for diagnosis.
  printf '%s\n' "Release evidence retained at: $temporary"
}
trap cleanup EXIT
git archive "$sha" | tar -x -C "$candidate"
docker build --tag "$test_image" --file "$candidate/scripts/release.Dockerfile" "$candidate" 2>&1 | tee "$evidence/test-image-build.log"
docker network create --internal "$network" >/dev/null
docker run -d --name "$database" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=miniapp -e POSTGRES_PASSWORD=miniapp -e POSTGRES_DB=miniapp_test \
  postgres:17-alpine >/dev/null
ready=false
for _ in {1..60}; do
  if docker exec "$database" pg_isready -U miniapp -d miniapp_test >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]] || die 'isolated PostgreSQL did not become ready'
docker run --rm --network "$network" \
  --mount "type=bind,src=$evidence,dst=/evidence" \
  -e "MINIAPP_RELEASE_SHA=$sha" \
  -e DATABASE_URL=postgresql+asyncpg://miniapp:miniapp@postgres:5432/unused_app \
  -e TEST_DATABASE_URL=postgresql+asyncpg://miniapp:miniapp@postgres:5432/miniapp_test \
  -e SECRET_KEY=release-tests-only-not-a-production-secret \
  "$test_image" 2>&1 | tee "$evidence/gate.log"
docker run --rm --network none --mount "type=bind,src=$evidence,dst=/evidence,readonly" \
  "$test_image" python /release/scripts/release_artifacts.py verify /evidence "$sha"
if [[ $backend_changed == true ]]; then
  docker build --tag "$api_image" "$candidate/back" 2>&1 | tee "$evidence/api-image-build.log"
  docker run -d --name "$canary" --network "$network" \
    --mount "type=bind,src=$evidence/miniapp-dist,dst=/miniapp/dist,readonly" \
    -e DATABASE_URL=postgresql+asyncpg://miniapp:miniapp@postgres:5432/miniapp_test \
    -e SECRET_KEY=release-tests-only-not-a-production-secret -e APP_ENV=dev \
    "$api_image" uvicorn main:app --host 0.0.0.0 --port 8000 >/dev/null
  ready=false
  for _ in {1..60}; do
    if docker exec "$canary" python -c 'import hashlib,pathlib,urllib.request; urllib.request.urlopen("http://127.0.0.1:8000/", timeout=2); body=urllib.request.urlopen("http://127.0.0.1:8000/s/release-check", timeout=2).read(); assert hashlib.sha256(body).digest()==hashlib.sha256(pathlib.Path("/miniapp/dist/index.html").read_bytes()).digest()' >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
  done
  [[ $ready == true ]] || die 'candidate API did not boot on the isolated test database'
  docker rm -f "$canary" >/dev/null
fi
[[ $(git rev-parse HEAD) == "$before" && -z $(git status --porcelain) ]] || die 'checkout changed during release checks'
if [[ $mode == --check ]]; then
  printf '%s\n' "Candidate $sha passed; live checkout and services were not changed."
  exit 0
fi

# Check only presence/shape, offline. Real SMTP accepts/rejects delivery at run time.
docker run --rm --network none --env-file "$repo/back/.env" \
  "$test_image" python /release/scripts/check_miniapp_mailer.py
release_config="$git_dir/miniapp-release.compose.yml"
compose=(docker compose --project-directory "$repo" -f "$repo/docker-compose.yml")
[[ ! -f $release_config ]] || compose+=(-f "$release_config")
if [[ $backend_changed == true ]]; then
  previous_api_container=$("${compose[@]}" ps -q api)
  previous_worker_container=$("${compose[@]}" ps -q worker)
  [[ -n $previous_api_container && -n $previous_worker_container ]] || die 'running API and worker are required for runtime rollback'
  previous_api_image=$(docker inspect --format '{{.Image}}' "$previous_api_container")
  previous_worker_image=$(docker inspect --format '{{.Image}}' "$previous_worker_container")
fi
docker run --rm --network none --mount "type=bind,src=$evidence,dst=/evidence" \
  --mount "type=bind,src=$repo/miniapp/dist,dst=/live,readonly" \
  "$test_image" python /release/scripts/release_artifacts.py backup /live /evidence
docker run --rm --network none --mount "type=bind,src=$evidence,dst=/evidence,readonly" \
  "$test_image" python /release/scripts/release_artifacts.py verify /evidence "$sha"
[[ $(git rev-parse HEAD) == "$before" && -z $(git status --porcelain) ]] || die 'checkout changed before promotion'

# Every test and build above must succeed before this first live mutation.
# Establish durable runtime state before HEAD can advance. Failed rollout and
# rollback leave this marker unchanged so retrying the same SHA cannot skip API.
if [[ ! -f $deployed_marker ]]; then
  printf '%s\n' "$deployed_sha" >"$deployed_marker.tmp"
  mv -f "$deployed_marker.tmp" "$deployed_marker"
fi
git merge --ff-only "$sha"
rollback() {
  trap - ERR
  printf '%s\n' 'Promotion failed; restoring the previous UI index and API/worker images.' >&2
  docker run --rm --network none --mount "type=bind,src=$evidence,dst=/evidence,readonly" \
    --mount "type=bind,src=$repo/miniapp/dist,dst=/live" \
    "$test_image" python /release/scripts/release_artifacts.py restore /live /evidence || true
  if [[ $backend_changed == true ]]; then
    printf 'services:\n  api:\n    image: %s\n    command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]\n  worker:\n    image: %s\n' \
      "$previous_api_image" "$previous_worker_image" >"$release_config"
    docker compose --project-directory "$repo" -f "$repo/docker-compose.yml" -f "$release_config" \
      up -d --no-build --force-recreate api worker || true
  fi
  printf '%s\n' "Runtime rollback attempted; source remains at tested commit $sha. Inspect services and retained evidence." >&2
  exit 1
}
trap rollback ERR
mkdir -p "$repo/miniapp/dist"
docker run --rm --network none \
  --mount "type=bind,src=$evidence,dst=/evidence,readonly" \
  --mount "type=bind,src=$repo/miniapp/dist,dst=/live" \
  "$test_image" python /release/scripts/release_artifacts.py promote /evidence /live "$sha"
if [[ $backend_changed == true ]]; then
  printf 'services:\n  api:\n    image: %s\n    command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]\n  worker:\n    image: %s\n' "$api_image" "$api_image" >"$release_config"
  docker compose --project-directory "$repo" -f "$repo/docker-compose.yml" -f "$release_config" \
    up -d --no-build --force-recreate api worker
  ready=false
  for _ in {1..30}; do
    if docker compose --project-directory "$repo" -f "$repo/docker-compose.yml" -f "$release_config" \
      exec -T api python -c 'import hashlib,pathlib,urllib.request; urllib.request.urlopen("http://127.0.0.1:8000/", timeout=2); body=urllib.request.urlopen("http://127.0.0.1:8000/s/release-check", timeout=2).read(); assert hashlib.sha256(body).digest()==hashlib.sha256(pathlib.Path("/miniapp/dist/index.html").read_bytes()).digest()' >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
  done
  [[ $ready == true ]] || rollback
  worker_container=$(docker compose --project-directory "$repo" -f "$repo/docker-compose.yml" -f "$release_config" ps -a -q worker)
  [[ -n $worker_container && $(docker inspect --format '{{.State.Running}}' "$worker_container") == true ]] || rollback
fi
printf '%s\n' "$sha" >"$deployed_marker.tmp"
mv -f "$deployed_marker.tmp" "$deployed_marker"
trap - ERR
printf '%s\n' "Released tested candidate: $sha"
