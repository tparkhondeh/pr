#!/usr/bin/env bash
# Run AFTER CI, deployment and private-session-smoke. No credentials are changed.
set -euo pipefail
umask 077
root=/home/wealthos/apps/pr
doc=/home/wealthos/pr.wealthos.ir
sha=${1:?verified SHA required}
[[ "$sha" =~ ^[a-f0-9]{40}$ ]]
test "$(tr -d '\r\n' < "$root/SOURCE_COMMIT")" = "$sha"
test -s "$root/deploy/cpanel/session.htaccess"
node -e 'Promise.all([fetch("http://127.0.0.1:31056/",{redirect:"manual"}),fetch("http://127.0.0.1:31056/login"),fetch("http://127.0.0.1:31056/api/workbench")]).then(async ([a,b,c])=>process.exit(a.status===303&&a.headers.get("location")==="/login"&&b.status===200&&(await b.text()).includes("خوش آمدید")&&c.status===401?0:1)).catch(()=>process.exit(1))'
backup="$root/.deploy-backups/session-proxy-before-$sha"
test ! -e "$backup"
mkdir -m 700 "$backup"
cp "$doc/.htaccess" "$backup/previous.htaccess"
cp "$root/deploy/cpanel/session.htaccess" "$doc/.htaccess"
# Validate through real TLS; restore the old Basic guard if the proxy switch fails.
if ! node -e 'Promise.all([fetch("https://pr.wealthos.ir/",{redirect:"manual"}),fetch("https://pr.wealthos.ir/login"),fetch("https://pr.wealthos.ir/api/workbench")]).then(async ([a,b,c])=>process.exit(a.status===303&&!a.headers.has("www-authenticate")&&b.status===200&&(await b.text()).includes("خوش آمدید")&&c.status===401&&!c.headers.has("www-authenticate")?0:1)).catch(()=>process.exit(1))'; then
  cp "$backup/previous.htaccess" "$doc/.htaccess"
  echo 'Session proxy validation failed; previous Basic guard restored.' >&2
  exit 1
fi
echo 'Session login active; private API denied anonymously; previous proxy backed up.'
