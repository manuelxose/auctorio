# AUCTORIO SEO INTELLIGENCE V2 — Permanent engineering and product contract

Authored by the product owner. Persisted verbatim in milestone SEO-V2-01; change it only on the owner's
instruction. Every milestone reads this document and the rest of `docs/seo-v2/` first.

- Project: Auctorio — production-grade, cost-efficient, multi-tenant SEO SaaS.
- Repository: https://github.com/manuelxose/auctorio

## Primary objective

Maximize sustainable organic growth and business value for every connected website while minimizing
unnecessary external API expenditure.

This is not a simple DataForSEO replacement.

Build a provider-independent SEO intelligence system that accumulates knowledge, learns from real website
performance, reuses existing data and purchases external information only when it adds measurable value.

## Mandatory rules

1. Preserve DataForSEO and all currently supported capabilities.
2. Introduce AnyAPI as the initial alternative provider candidate.
3. Validate AnyAPI's official documentation, actual billing model, supported markets, commercial usage
   rights, storage restrictions and upstream data licensing before production activation.
4. Do not assume that provider metrics are interchangeable.
5. Never fabricate search volume, rankings, CPC, difficulty or traffic.
6. Distinguish observed, provider-reported, estimated, historical, unavailable and unknown data.
7. Reuse the existing PostgreSQL, Prisma, workers, queues, cache, authentication, tenant isolation and
   cost-accounting architecture.
8. Do not introduce unnecessary microservices or duplicated systems.
9. Never perform external paid requests from dashboard rendering, page navigation, calendar rearrangement or
   ordinary content editing.
10. Route every external SEO acquisition through the centralized provider manager and cost governor.
11. Enforce strict global, tenant and website budget limits.
12. Prioritize existing data, authorized free sources and local computation before purchasing additional data.
13. Keep existing editorial, publishing and automation capabilities functional throughout the migration.
14. All production-facing functionality must have appropriate permissions, audit logs, operational states and
    error handling.
15. A disabled provider must never receive requests.
16. Unknown prices must never result in unlimited spending.
17. Provider credentials must remain server-side and encrypted using the project's approved secret-management
    mechanism.
18. Never bypass provider quotas, access restrictions or licensing.
19. Private tenant data must never leak into global datasets.
20. External data may only be shared across tenants when the applicable license explicitly permits it.
21. No automatic production deployment without explicit approval.
22. No paid live validation without an explicitly authorized budget.

## Engineering workflow

- Inspect the repository and existing architecture before implementation.
- Use the configured multi-agent harness when available.
- Use bounded specialist delegation and isolated worktrees when useful.
- Assign clear, non-overlapping responsibilities.
- Avoid endless review loops and unnecessary model consumption.
- Reuse Graphify, Ponytail, Caveman and other relevant installed capabilities where available and appropriate.
- Never install untrusted tooling or overwrite existing configuration merely to satisfy a tool requirement.
- Use one bounded independent verification pass per milestone, with targeted remediation of material findings.
- Do not repeatedly rebuild already accepted functionality.

## Git workflow

- Start every milestone from the latest accepted main branch.
- Create a dedicated feature branch.
- Use incremental commits.
- Run relevant tests, migrations, builds and integration checks.
- Merge into main only after meeting all mandatory milestone gates and when repository permissions allow it.
- Never force-push or discard unrelated user changes.
- If a mandatory gate fails, preserve the work and report the blocker.
- Do not start the next milestone from an unaccepted implementation.

## Permanent documentation

- `docs/seo-v2/engineering-contract.md`
- `docs/seo-v2/architecture.md`
- `docs/seo-v2/provider-capabilities.md`
- `docs/seo-v2/cost-model.md`
- `docs/seo-v2/data-governance.md`
- `docs/seo-v2/production-readiness.md`
- `docs/seo-v2/milestones/`

Each milestone must read these documents and update only the relevant sections according to verified
implementation evidence.

## Reporting

All final reports must be written in Spanish and include:

- Actual implementation.
- Decisions and assumptions.
- Files and migrations modified.
- Test and acceptance results.
- API requests actually performed.
- Actual API expenditure.
- Remaining blockers.
- Security and licensing findings.
- Git branch, commit and merge status.
- PASS, PARTIAL or BLOCKED verdict.

Never report PASS based solely on mocked provider responses when the acceptance criterion requires a real
external integration.

Proceed autonomously within authorized limits. Do not repeatedly ask the user for nonessential decisions.

## Target architecture (owner's diagram)

```text
 Studio (usuario)   Administración (control global)   Automatización (workers)
          └──────────────────────┬──────────────────────┘
              Auctorio SEO Intelligence Engine
          investigación · planificación · optimización
                                 │
          SEO Knowledge & Opportunity Repository
          keywords · clústeres · métricas · evidencias
                                 │
                        SEO Cost Governor
          presupuestos · caché · lotes · deduplicación
                                 │
                       SEO Provider Router
             ┌───────────────────┼───────────────────┐
     AnyAPI (alternativa)  DataForSEO (conservado)  Fuentes propias (GSC · crawler)
             └───────────────────┼───────────────────┘
              Registro de consumo y resultados SEO
```
