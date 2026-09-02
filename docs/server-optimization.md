# Server optimization runbook

The host is shared by Auctorio, GuíaTV, Tecnoria, PostgreSQL, MongoDB and
Valkey. Development agents belong on Windows/WSL2.

Run `bash scripts/server-audit.sh` before and after changes. It is read-only.
`bash scripts/stop-dev-agents.sh` sends SIGTERM only to Claude/Cloud Code and
active build/test commands; it does not stop production systemd services.

If Cloud Code reappears, close the remote VS Code session or disable its
extension in the remote profile: it is spawned by VS Code Server, not by an
Auctorio systemd unit.

From WSL2, run `bash scripts/wsl-bootstrap.sh`; keep `.env` local and never
copy production environment files or credentials.

CI runs quality gates. Production deploy and rollback are manual workflow
actions requiring `PRODUCTION_HOST`, `PRODUCTION_USER` and
`PRODUCTION_SSH_KEY` secrets in the GitHub production environment.

Do not reduce production worker counts from a single sample. Measure queue
latency and CPU for at least 15 minutes first. GuíaTV `syncEPG` and
`precomputeSchedules` are high-CPU candidates requiring application-specific
scheduling review.
