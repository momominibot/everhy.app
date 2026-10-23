#!/bin/bash
# Every check Ebb has, in one go: all node suites, then every browser smoke. Prints one line per check and a total.
# Usage: bash tools/check_all.sh          (about 8 minutes; nothing leaves the machine; no model calls)
cd "$(dirname "$0")/.." || exit 1
fail=0
LOG=$(mktemp)
# a check passes when it exits 0; its last line is shown for reading
run() { local name="$1"; shift; perl -e 'alarm 600; exec @ARGV' "$@" > "$LOG" 2>&1; local code=$?
  printf '%-14s %s %s\n' "$name" "$([ $code = 0 ] && echo ok || echo FAIL)" "$(tail -1 "$LOG")"; [ $code = 0 ] || fail=1; }
for t in tools/test-*.js; do run "$(basename "$t" .js)" node "$t"; done
python3 -m http.server 8096 --bind 127.0.0.1 >/dev/null 2>&1 & SRV=$!
sleep 1
OUT=$(mktemp -d)
run doors python3 tools/smoke_doors.py
run map python3 tools/smoke_map.py http://localhost:8096/
run safety python3 tools/smoke-safety.py . "$OUT"
for s in tools/smoke_*.py; do
  case "$s" in tools/smoke_doors.py|tools/smoke_map.py) continue;; esac
  run "$(basename "$s" .py)" python3 "$s"
done
kill $SRV 2>/dev/null
[ $fail = 0 ] && echo "ALL GREEN" || { echo "SOMETHING FAILED: fix it before committing"; exit 1; }
