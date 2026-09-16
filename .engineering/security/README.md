# Security boundary

Security work is verified against live source, migrations, tests, and the
production dependency graph. Do not use `npm audit fix --force`; major package
upgrades require a separately planned compatibility review.

Credentials are referenced by environment-backed names or encrypted database
values. Secret scans report paths and classifications only, never values.

Current security gate: the critical production audit finding was removed by a
non-breaking lockfile remediation on 2026-09-16. Six moderate/high findings
remain behind major-version fixes and are a release blocker until separately
reviewed.
