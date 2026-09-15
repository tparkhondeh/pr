#!/usr/bin/env bash
# Use only after CI success for the exact SHA. Never extracts secrets from Git.
set -euo pipefail
umask 077
root=/home/wealthos/apps/pr
sha=${1:?source SHA required}
checksum=${2:?artifact SHA256 required}
[[ "$sha" =~ ^[a-f0-9]{40}$ ]]
[[ "$checksum" =~ ^[a-fA-F0-9]{64}$ ]]
test "$(id -un)" = wealthos_dev
artifact="$root/.deploy-incoming-$sha.tar.gz"
printf '%s  %s\n' "$checksum" "$artifact" | sha256sum -c -
stage="$root/.deploy-staging/$sha"
test ! -e "$stage"
mkdir -p "$stage"
test "$(realpath "$stage")" = "$root/.deploy-staging/$sha"
if tar -tzf "$artifact" | grep -E '(^/|(^|/)\.\.(/|$)|(^|/)\.(private|infrastructure|git|env)(/|$))' >/dev/null; then
  printf 'Unsafe release paths.\n' >&2; exit 1
fi
tar -xzf "$artifact" -C "$stage"
test "$(tr -d '\r\n' < "$stage/SOURCE_COMMIT")" = "$sha"
test -s "$stage/runtime/main.cjs"
test -s "$stage/runtime/private-postgres-backup.cjs"
test -s "$stage/apps/web/dist/index.html"

backup="$root/.deploy-backups/release-before-$sha"
test ! -e "$backup"
mkdir -m 700 "$backup"
# Preserve every existing target (including source and built runtime) before overwrite.
cd "$root"
targets=()
while IFS= read -r -d '' item; do
  name=$(basename "$item")
  if test -e "$root/$name"; then targets+=("$name"); fi
done < <(find "$stage" -mindepth 1 -maxdepth 1 -print0)
tar --exclude=node_modules --exclude=.git -czf "$backup/previous-release.tar.gz" "${targets[@]}"
if test -f "$root/.private/runtime.json"; then
  cp "$root/.private/runtime.json" "$backup/runtime.json"
  # A live persistent release is backed up before any restart.
  node "$root/runtime/private-postgres-backup.cjs" --restore
else
  # Never silently replace a nonempty memory installation with a new database.
  node "$stage/runtime/export-private-state.cjs" --require-empty
  test -f "$root/.private/runtime-candidate.json"
fi

# Root is ACL-writable but owned by cPanel; do not try to preserve its timestamps.
while IFS= read -r -d '' item; do
  cp -a "$item" "$root/"
done < <(find "$stage" -mindepth 1 -maxdepth 1 -print0)
if ! test -f "$root/.private/runtime.json"; then
  cp "$root/.private/runtime-candidate.json" "$root/.private/runtime.json"
  chmod 600 "$root/.private/runtime.json"
fi
pm2 startOrRestart "$root/deploy/cpanel/ecosystem.config.cjs" --update-env >/dev/null
healthy=false
for attempt in $(seq 1 20); do
  if node -e 'fetch("http://127.0.0.1:31056/ready").then(async r=>{const x=await r.json();process.exit(r.ok&&x.persistence==="postgres"&&x.durability==="persistent"?0:1)}).catch(()=>process.exit(1))'; then
    healthy=true; break
  fi
  sleep 1
done
if test "$healthy" != true; then
  # Preserve new PostgreSQL data/config even when restoring previous application code.
  # The previous verified application already supports PostgreSQL; no memory fallback.
  mkdir "$backup/rollback-stage"
  tar -xzf "$backup/previous-release.tar.gz" -C "$backup/rollback-stage"
  cp "$backup/rollback-stage/runtime/main.cjs" "$root/runtime/main.cjs"
  cp -a "$backup/rollback-stage/apps/web/dist/." "$root/apps/web/dist/"
  cp "$backup/rollback-stage/SOURCE_COMMIT" "$root/SOURCE_COMMIT"
  pm2 startOrRestart "$root/deploy/cpanel/ecosystem.config.cjs" --update-env >/dev/null
  printf 'Release failed; previous application restored with persistent data retained.\n' >&2
  exit 1
fi
printf 'Release %s is ready with persistent storage. Backup: %s\n' "$sha" "$backup"
