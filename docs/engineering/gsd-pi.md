# GSD Pi bootstrap and recovery

GSD Pi is installed as the workspace-wide engineering runtime. Do not remove
legacy tooling or change Auctorio runtime configuration until completed GSD
validation—not merely provider configuration—records the required planning,
execution, isolated-worktree, resume, and recovery evidence.

## Installed runtime

Validated on 2026-09-15:

```text
$ command -v gsd && gsd --version
/home/manuelxose/.nvm/versions/node/v24.13.0/bin/gsd
1.20.0
```

The host uses Node `v24.13.0`, which satisfies GSD Pi 1.20.0's `>=22.18.0`
requirement. Before installation, `gsd` was absent from `PATH`; an older
`@opengsd/gsd-core` package existed but did not provide a `gsd` executable.

## Install or repair

Use the supported scripted installer first:

```bash
npx @opengsd/gsd-pi@latest --yes
```

If an interrupted install leaves package or binary ownership inconsistent,
repair it with the upstream documented direct install, then verify exactly one
resolved command:

```bash
npm install --global --force @opengsd/gsd-pi@latest
command -v gsd
type -a gsd
gsd --version
```

`--force` is only the recovery path for a confirmed global-bin collision; it
can replace an older package's overlapping executable. Do not use it for a
normal upgrade.

For routine upgrades, use either:

```bash
gsd update
# or, when npm owns the global installation:
npm install --global @opengsd/gsd-pi@latest
```

## State and credentials

Project state is stored under `<project>/.gsd/`, including the canonical
`.gsd/gsd.db`. Recovery rehearsals create `.gsd/backups/` and retain recovery
applications in `.gsd/recovery-applications/`. Interactive sessions are
per-directory; use `gsd --continue` for the latest session or `gsd sessions`
to select one.

Configure a provider outside the repository with:

```bash
cd /path/to/project
gsd config
```

The wizard configures the LLM provider and optional search/tool integrations.
Supply credentials only in its approved authentication flow or the provider's
own secure configuration; never commit them, place them in Auctorio files, or
pass them on a command line. In the validation host, no provider credential
signal was available, so agent-backed planning, execution, worktree creation,
and session resume remain blocked.

## Normal workflow

After provider configuration, initialize in the target project and create the
milestone or planning task interactively:

```bash
cd /path/to/project
gsd
```

For isolated work, GSD owns the worktree lifecycle:

```bash
gsd -w docs-update        # create or resume an isolated worktree/session
gsd worktree list         # inspect worktrees and their status
gsd -w docs-update        # resume the same worktree/session
gsd worktree merge docs-update
```

`gsd headless` supports non-TUI orchestration; `gsd headless query` reads the
current state, and `gsd headless --resume <id> auto` resumes a headless session.
Avoid `merge`, `remove --force`, or any destructive recovery option until the
changes and backup are reviewed.

## Recovery

Start with a non-destructive preview:

```bash
gsd headless recover
```

GSD prints a `--preview=sha256:...` token. Apply only that verified preview:

```bash
gsd headless recover --preview=sha256:<token-from-preview>
```

This performs a verified backup-and-restore rehearsal and records the retained
application. It does not repair, retry, or resume a failed agent task. A later
`--restore` command is destructive; use it only with the exact retained
application ID and consent token emitted by GSD after reviewing the backup.

## Validation matrix

| Capability | Status | Evidence |
| --- | --- | --- |
| Official package and CLI | PASS | `@opengsd/gsd-pi@1.20.0`; `gsd --version` returned `1.20.0`. |
| Disposable Git repository | PASS | Fresh repository initialized with a seed commit outside Auctorio. |
| Project-state initialization | PASS | GSD created `.gsd/gsd.db`; `gsd headless query` returned pre-planning state. |
| Headless state query | PASS | Post-recovery query exited 0 and reported no active milestones. |
| Worktree inspection/cleanup | PASS | `gsd worktree list` and `gsd worktree clean` completed with no worktrees. |
| Controlled providerless failure | PASS | The harmless quick task timed out with zero tool calls and created no commit. |
| Failed-task recovery, retry, or resume | BLOCKED | The preview-gated database recovery rehearsal created a backup, but no provider-backed task exists to repair, retry, or resume. |
| Provider setup, planning, task execution | BLOCKED | No provider credential signal was available on the host; do not invent provider setup. |
| Isolated task worktree and session resume | BLOCKED | These are agent-backed flows and require the blocked provider setup. |

The installer invocation `npx @opengsd/gsd-pi@latest --yes` exceeded the
120-second validation limit while installing globally. The documented direct
npm install repaired its global-bin collision and produced the validated CLI.

## Uninstall runtime

Remove the global package:

```bash
npm uninstall --global @opengsd/gsd-pi gsd-pi
```

## Optional destructive user-state purge

Only after preserving all required plans, sessions, and recovery backups, a
user may remove their user-scoped GSD state:

```bash
rm -rf ~/.gsd
```

This is irreversible and does not remove a project's `.gsd/` directory.
Remove project-local state separately only after the same preservation review.
