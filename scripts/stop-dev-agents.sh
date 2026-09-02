#!/usr/bin/env bash
set -euo pipefail
patterns=('cloudcode_cli' '/anthropic.claude-code[^ ]*/.*claude' '/.claude/remote/ccd-cli/' 'npm (run )?(test|build)' 'ng build' 'tsc -p .*--noEmit')
for pattern in "${patterns[@]}"; do
  for pid in $(pgrep -f "$pattern" || true); do
    [[ "$pid" == "$$" ]] && continue
    cmd=$(ps -o args= -p "$pid" 2>/dev/null || true)
    [[ -z "$cmd" ]] && continue
    echo "Stopping development process $pid: $cmd"
    kill -TERM "$pid" 2>/dev/null || true
  done
done
echo 'Production services were not modified.'
