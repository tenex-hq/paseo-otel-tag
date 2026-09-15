# Paseo metadata available to this plugin

Captured from a `before("agent.session_open")` hook on Paseo 0.8.0 by logging
`JSON.stringify` of each object, then reading `paseo plugin logs`. Values below are real,
from a session in a `local_checkout` workspace. Field names in the SDK differ from what
`paseo project ls --json` and `paseo workspace ls --json` print, so trust this file over the
CLI output.

## The hook request

`PluginSessionOpenRequest`, the argument the hook can return a modified copy of:

```json
{
  "agentId": "2614437f-fad7-4357-b79e-8cfa901299a2",
  "workspaceId": "wks_66080ded1ddee40a",
  "provider": "claude",
  "cwd": "/Users/nbi/.config/nix-darwin",
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
  "id": "wks_66080ded1ddee40a",
  "projectId": "prj_9a7d49f2aa19758e",
  "projectDisplayName": "nix-darwin",
  "projectCustomName": null,
  "projectCustomIconRevision": null,
  "projectRootPath": "/Users/nbi/.config/nix-darwin",
  "workspaceDirectory": "/Users/nbi/.config/nix-darwin",
  "projectKind": "git",
  "workspaceKind": "local_checkout",
  "name": "Centralize Claude telemetry configuration",
  "title": "Centralize Claude telemetry configuration",
  "pinnedAt": null,
  "archivingAt": null,
  "status": "running",
  "statusEnteredAt": "2026-09-15T13:54:32.802Z",
  "activityAt": null,
  "diffStat": null,
  "scripts": [],
  "project": {
    "projectKey": "prj_9a7d49f2aa19758e",
    "projectName": "nix-darwin",
    "workspaceName": "Centralize Claude telemetry configuration",
    "checkout": {
      "cwd": "/Users/nbi/.config/nix-darwin",
      "currentBranch": "main",
      "remoteUrl": null,
      "worktreeRoot": "/Users/nbi/.config/nix-darwin",
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
  "projectId": "prj_1ae8e49446d306ea",
  "projectKey": "remote:github.com/nicolasbissig/homelab",
  "projectDisplayName": "homelab",
  "projectCustomName": null,
  "projectCustomIconRevision": null,
  "projectIconRevision": "automatic:none:v1",
  "projectRootPath": "/Users/nbi/projects/private/homelab",
  "projectKind": "git"
}
```

`projectKey` is the stable identity across machines: `remote:<host>/<owner>/<repo>` for a
project with a remote, `host:<serverId>:<absolute path>` for one without.

## Candidates for more telemetry attributes

Everything above is reachable in the hook that already sets `OTEL_RESOURCE_ATTRIBUTES`, so
adding an attribute costs one more `key=value` pair. Values may not contain spaces, commas,
quotes or backslashes, so anything free-text needs the same sanitizing as the project tag.

| Attribute | Source | Cardinality | Notes |
| --- | --- | --- | --- |
| `paseo.agent_id` | `request.agentId` | one per agent | Links a Claude `session.id` to the Paseo agent that ran it. The strongest reason to add a field. |
| `paseo.provider` | `request.provider` | a handful | Separates Claude usage from Codex and the rest. |
| `paseo.session_reason` | `request.reason` | four values | Distinguishes a fresh agent from a resume, which otherwise look identical in cost data. |
| `paseo.workspace_kind` | `workspace.workspaceKind` | four values | Tells worktree runs apart from checkouts. |
| `project.kind` | `workspace.projectKind` | three values | Marks the multi-repo directories that have no git identity. |
| `project.name` | `workspace.projectDisplayName` | one per project | Readable label next to the path-derived tag. |
| `vcs.ref.head.name` | `gitRuntime.currentBranch` | one per branch | Claude Code has this key reserved but does not emit it. |
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
