# Network request map — STUDIO-01 (live, QA session, all 200)

Prefix `/studio/api/backend/v2/` (BFF proxy). Always on every route: `session/me`, `admin/me`, `operations`, `notifications`; at >=1024 also `copilot/threads`, `copilot/competencies`, `POST copilot/context`.

| Route | Route-specific reads |
|---|---|
| overview | automation, overview, site-intelligence/:id, editorial-plans, editorial-plans/:id |
| site-intelligence | sites/:id/strategy, site-intelligence/:id, site-intelligence/:id/pages |
| sources | sites/:id/sources, sites/:id/source-recommendations |
| editorial-plan | editorial-plans, editorial-plans/:id |
| content | projects |
| calendar | calendar, publishing-accounts, projects |
| automation | automation, automation/health, automation/status, publishing-accounts |
| connections | connector-installations, social-connections, social-connections/setup, publishing-accounts |

Side-effecting CTAs (static trace from `studio-api.service.ts` + route guards; handlers and DB transitions NOT exercised):

| UI action | Request | Server permission |
|---|---|---|
| Publish project | POST projects/:id/publish | publishing.manage |
| Publish now | POST publications/:id/publish-now | publishing.manage |
| Create/edit/delete/verify publishing account | POST/PATCH/DELETE publishing-accounts[/:id[/verify]] | integrations.manage |
| Connector credentials / activate | POST connector-installations/:id/credentials, /activate | integrations.manage |
| Change automation policy, pause, resume, recover | PATCH automation, POST automation/pause, /resume, /recover | workspace.manage |
| Approve plan items (bulk) | POST editorial-plan-items/bulk-approve | not checked |
Also unchecked: social-connections session/verify/reconnect/delete, connector discover/verify/cancel/resume.
