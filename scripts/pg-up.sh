#!/usr/bin/env bash
# Local throwaway PostgreSQL for running agent-written code against a REAL database (no fake ORM).
# Data dir: ${WCE_PG_DIR:-/workspace/.wce-pg}; port ${WCE_PG_PORT:-54329}; trust auth on 127.0.0.1 only.
set -euo pipefail
BIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
DIR=${WCE_PG_DIR:-/workspace/.wce-pg}; PORT=${WCE_PG_PORT:-54329}
if [ ! -f "$DIR/PG_VERSION" ]; then "$BIN/initdb" -D "$DIR" -U wce --auth=trust >/dev/null; fi
if ! "$BIN/pg_ctl" -D "$DIR" status >/dev/null 2>&1; then
  "$BIN/pg_ctl" -D "$DIR" -l "$DIR/server.log" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" start >/dev/null
fi
echo "postgresql://wce@127.0.0.1:$PORT/postgres"
