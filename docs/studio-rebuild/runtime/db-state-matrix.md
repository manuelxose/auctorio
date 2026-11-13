# Sanitized state matrix — STUDIO-01 (read via authenticated API, QA account)

| Site | Mode | enabled | state | autoApprove | autoPublish | circuitOpen |
|---|---|---|---|---|---|---|
| GuiaProgramacionTV (d8e75bac) | assisted | true | active | false | false | false |
| Auctorio (f76991c2) | manual | false | active | false | false | false |

- `publishing-accounts`: **0 rows**. `social-connections`: **0 rows**. => no destination can publish for either site; Overview shows "No destinations connected" for Auctorio.
- `connector-installations`: 17 (all kind `website`), 1 linked to a site (GuiaProgramacionTV), 16 unlinked; the API list does not expose a status field (read as `undefined`).
- Session `admin/me` exposes `isPlatformAdmin`; the QA account's role set was not read.
- No secrets, credential refs or cookies read. No writes except resetting the password of the local QA account (disposable).
