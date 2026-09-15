# Paseo metadata available to this plugin

Captured from a `before("agent.session_open")` hook on Paseo 0.8.0 by logging
`JSON.stringify` of each object, then reading `paseo plugin logs`. The samples below keep the
real shape of a session in a `local_checkout` workspace with identifiers and paths replaced. Field names in the SDK differ from what
`paseo project ls --json` and `paseo workspace ls --json` print, so trust this file over the
CLI output.

## The hook request

`PluginSessionOpenRequest`, the argument the hook can return a modified copy of:

```json
{
  "agentId": "11111111-2222-3333-4444-555555555555",
  "workspaceId": "wks_0000000000000001",
  "provider": "claude",
  "cwd": "/home/you/code/dotfiles",
  "reason": "create",
  "purpose": "interactive",
  "env": {}
}
```

`reason` is `create | resume | refresh | import`. `purpose` is `interactive | history`. Only
`env` is modifiable; `cwd` is fixed. Note `env` arrives empty, so a Paseo agent inherits the
daemon's environment and nothing else.

The same registration also accepts `agent.create`, which modifies `config` and `env`, and
`workspace.create`, which modifies the whole creation request.

## The workspace

`paseo.workspaces.ref(id).refresh()` returns this in one call. No second lookup is needed to
reach the project:

```json
{
  "id": "wks_0000000000000001",
  "projectId": "prj_0000000000000001",
  "projectDisplayName": "dotfiles",
  "projectCustomName": null,
  "projectCustomIconRevision": null,
  "projectRootPath": "/home/you/code/dotfiles",
  "workspaceDirectory": "/home/you/code/dotfiles",
  "projectKind": "git",
  "workspaceKind": "local_checkout",
  "name": "Add request tracing",
  "title": "Add request tracing",
  "pinnedAt": null,
  "archivingAt": null,
  "status": "running",
  "statusEnteredAt": "2026-01-01T00:00:00.000Z",
  "activityAt": null,
  "diffStat": null,
  "scripts": [],
  "project": {
    "projectKey": "prj_0000000000000001",
    "projectName": "dotfiles",
    "workspaceName": "Add request tracing",
    "checkout": {
      "cwd": "/home/you/code/dotfiles",
      "currentBranch": "main",
      "remoteUrl": null,
      "worktreeRoot": "/home/you/code/dotfiles",
      "isGit": true,
      "isPaseoOwnedWorktree": false,
      "mainRepoRoot": null
    }
  },
  "gitRuntime": {
    "currentBranch": "main",
    "remoteUrl": null,
    "isPaseoOwnedWorktree": false,
    "isDirty": true,
    "aheadBehind": null,
    "aheadOfOrigin": null,
    "behindOfOrigin": null,
    "aheadOfOrigin": null
  },
  "githubRuntime": { "featuresEnabled": false, "pullRequest": null, "error": null }
}
```

`workspaceKind` is `worktree | directory | checkout | local_checkout`. `projectKind` is
`git | non_git | directory`. In a worktree workspace, `workspaceDirectory` is the worktree
path while `projectRootPath` stays on the project, and `checkout.mainRepoRoot` names the
repository the worktree came from.

## The project list

`paseo.projects.list()` returns `{ requestId, projects: [...] }`:

```json
{
  "projectId": "prj_0000000000000002",
  "projectKey": "remote:github.com/example-org/example-app",
  "projectDisplayName": "example-app",
  "projectCustomName": null,
  "projectCustomIconRevision": null,
  "projectIconRevision": "automatic:none:v1",
  "projectRootPath": "/home/you/code/example-app",
  "projectKind": "git"
}
```

`projectKey` is the stable identity across machines: `remote:<host>/<owner>/<repo>` for a
project with a remote, `host:<serverId>:<absolute path>` for one without.

## Telemetry attributes

Everything above is reachable in the hook that sets `OTEL_RESOURCE_ATTRIBUTES`, so adding an
attribute costs one more `key=value` pair. Values may not contain spaces, commas, quotes or
backslashes, so anything free-text needs the same sanitizing as the project tag.

The rows marked **emitted** are live in `server/attributes.ts`.

| Attribute | Source | Cardinality | Notes |
| --- | --- | --- | --- |
| `paseo.agent_id` **emitted** | `request.agentId` | one per agent | Links a Claude `session.id` to the Paseo agent that ran it. The strongest reason to add a field. |
| `paseo.provider` **emitted** | `request.provider` | a handful | Separates Claude usage from Codex and the rest. |
| `paseo.session_reason` **emitted** | `request.reason` | four values | Distinguishes a fresh agent from a resume, which otherwise look identical in cost data. |
| `paseo.workspace_kind` **emitted** | `workspace.workspaceKind` | four values | Tells worktree runs apart from checkouts. |
| `project.kind` **emitted** | `workspace.projectKind` | three values | Marks the multi-repo directories that have no git identity. |
| `project.name` **emitted** | `workspace.projectDisplayName` | one per project | Readable label next to the path-derived tag. |
| `vcs.ref.head.name` **emitted** | `gitRuntime.currentBranch` | one per branch | Claude Code reserves this key and leaves it empty. A probe confirmed the plugin's value arrives intact. |
| `paseo.pr` | `githubRuntime.pullRequest` | one per PR | Only populated when GitHub features are on. It was `null` here. |

Not worth attaching: `workspace.name` and `title` are model-generated prose, unbounded and
rewritten mid-session. `diffStat`, `status` and `activityAt` change during a session, but
resource attributes are fixed when the process starts, so a stale value is all you would get.

## Lifecycle events, for telemetry this hook cannot produce

`server.on(...)` observes events the launch environment cannot express, including
`agent.turn_started`, `agent.turn_ended` (with `outcome` of `completed | failed | canceled`
and the full turn timeline), `agent.permission_requested`, `agent.permission_resolved`,
`agent.created`, `agent.archived`, `workspace.created` and `workspace.archived`.

Claude Code already exports its own turn and permission telemetry, so the value here is
Paseo-specific: permission decisions made by Paseo's auto mode, and turns that Paseo
canceled. Emitting those requires an OTel exporter inside the plugin, since the launch environment
is fixed before any turn runs.
