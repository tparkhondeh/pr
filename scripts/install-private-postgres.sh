#!/usr/bin/env bash
# Build an isolated PR-owned PostgreSQL; does not touch system services or databases.
set -euo pipefail
umask 077
root=/home/wealthos/apps/pr/.infrastructure
version=16.15
test -d /home/wealthos/apps/pr
mkdir -p "$root"
test "$(realpath "$root")" = /home/wealthos/apps/pr/.infrastructure
if test -x "$root/pgsql/bin/postgres"; then
  "$root/pgsql/bin/postgres" --version
  exit 0
fi
mkdir -p "$root/build"
cd "$root/build"
curl --fail --silent --show-error --max-time 180 -O "https://ftp.postgresql.org/pub/source/v$version/postgresql-$version.tar.bz2"
curl --fail --silent --show-error --max-time 30 -O "https://ftp.postgresql.org/pub/source/v$version/postgresql-$version.tar.bz2.sha256"
sha256sum -c "postgresql-$version.tar.bz2.sha256"
test ! -d "postgresql-$version"
tar -xjf "postgresql-$version.tar.bz2"
cd "postgresql-$version"
./configure --prefix="$root/pgsql" --without-readline --without-icu --with-openssl > "$root/configure.log" 2>&1
nice -n 10 make -j1 > "$root/build.log" 2>&1
make install > "$root/install.log" 2>&1
make -C contrib/pgcrypto > "$root/pgcrypto-build.log" 2>&1
make -C contrib/pgcrypto install > "$root/pgcrypto-install.log" 2>&1
"$root/pgsql/bin/postgres" --version
