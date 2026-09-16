# Production readiness

Production release requires passing typecheck, backend build, Studio build,
migration validation, executable database/queue tests, E2E/browser checks,
secret scan, and dependency security gates. It also requires deployment
credentials and live destination/provider health, which must be verified in
the deployment environment and never copied into Git.

The deployment path installs both the root and `apps/studio-web` lockfiles
before building. Rollback remains the deployment operator's responsibility and
must be tested against the release procedure before a production claim.
