# paseo-otel-tag

A Paseo plugin that tags Claude Code telemetry with the directory an agent runs in.

## Why

Claude Code exports OpenTelemetry metrics, events and spans, and none of them carry the
working directory. `OTEL_METRICS_INCLUDE_REPOSITORY=1` adds `vcs.*` attributes derived from
the git `origin` remote, which covers a single-repo session and nothing else. A directory
holding several repos, or a repo without an origin, gets no attribution.

Setting `OTEL_RESOURCE_ATTRIBUTES` in the shell fixes that for terminal sessions. Paseo
execs the agent binary straight from the daemon with the GUI app environment, so a shell
function never runs and those sessions stay unlabeled.

This plugin sets the variable per session from the agent's working directory.

## Behavior

One `server.before("agent.session_open")` hook sets `OTEL_RESOURCE_ATTRIBUTES` for the session.
Claude Code puts every pair on each metric datapoint, event record and span:

| Attribute | Value | Omitted when |
| --- | --- | --- |
| `service.instance.id` | override env var, or the machine name | never |
| `host.name` | stable machine name | never |
| `host.id` | hardware id, `IOPlatformUUID` or `/etc/machine-id` | platform exposes none |
| `project` | working directory tag, see below | never |
| `project.name` | Paseo project display name | no workspace |
| `project.kind` | `git`, `non_git` or `directory` | no workspace |
| `paseo.agent_id` | Paseo agent UUID | never |
| `paseo.provider` | `claude`, `codex`, ... | never |
| `paseo.session_reason` | `create`, `resume`, `refresh` or `import` | never |
| `paseo.workspace_kind` | `worktree`, `directory`, `checkout` or `local_checkout` | no workspace |
| `vcs.ref.head.name` | current branch | non-git project |

`paseo.agent_id` is the field that links a Claude `session.id` to the Paseo agent that ran it.
Nothing in either system bridges those identifiers otherwise.

Claude Code keeps its own value on a collision, so none of these can shadow a built-in
attribute. `vcs.ref.head.name` is a key Claude Code reserves and does not populate, and a probe
confirmed the plugin's value arrives intact next to the `vcs.*` set that
`OTEL_METRICS_INCLUDE_REPOSITORY` produces.

The `project` tag is the working directory relative to `$HOME`:

| cwd | tag |
| --- | --- |
| `~` | `home` |
| `~/projects/nova/api` | `projects/nova/api` |
| `/tmp/foo` | `tmp/foo` |
| `~/my proj,x` | `my_proj_x` |

Characters outside `[A-Za-z0-9._/-]` become `_`, since the OTel spec forbids spaces, commas
and quotes in attribute values. Forward slashes are legal and stay.

An `OTEL_RESOURCE_ATTRIBUTES` already present in the launch environment is left alone.

### Worktree workspaces

A Paseo worktree workspace runs in `~/.paseo/worktrees/<slug>/<name>`, a path that says nothing
about where it branched from. Tagging that directly would scatter one project across a new label
per branch.

The hook asks the daemon instead. It refreshes the session's workspace and reads
`projectRootPath`, which stays on the project even when the session runs in a worktree. An agent
in a worktree off `~/.config/nix-darwin` is tagged `project=.config/nix-darwin`, the same as an
agent running in the checkout itself.

The lookup falls back to the session's own `cwd` when the workspace carries no project root or the
call fails, so a daemon hiccup degrades the label rather than blocking the session.

`docs/paseo-metadata.md` records every field that object exposes, with notes on which ones are
worth adding as further telemetry attributes.

## Configuration

`PASEO_OTEL_SERVICE_INSTANCE_ID` overrides `service.instance.id`. `OTEL_SERVICE_INSTANCE_ID` works
too and is the name the shell counterpart reads, so one export covers both. Set it when a host runs
several daemons, or when the machine name is not the label you want in dashboards.

Both are read from the daemon's own environment rather than from a shell. A daemon started by the
desktop app inherits the GUI session environment, so exporting the variable in a terminal does not
reach it. Set it in the service definition that launches the daemon.

### Machine identity

`service.instance.id` defaults to the machine name, and `host.name` always carries it.

`os.hostname()` is not stable on macOS. A DHCP server that supplies a host name sets the system
HostName and the hostname follows it, so the same laptop reports one name at home and another on a
corporate network. The plugin reads `scutil --get LocalHostName` first, which comes from the Sharing
settings panel and ignores DHCP, and drops a trailing `.local` either way. Linux and the BSDs read
the hostname from local configuration, so `os.hostname()` is used there.

`host.id` carries a hardware identifier that no network change can affect: `IOPlatformUUID` on
macOS, `/etc/machine-id` on Linux. Group by that when a name has drifted on you before.

## Install

```bash
paseo plugin add tenex-hq/paseo-otel-tag
```

The manifest ID is `paseo-otel-project-tag`, which is the name to pass to
`paseo plugin reload` and `paseo plugin logs`.

The daemon needs `pluginsEnabled: true` in its `config.json`. Plugins are trusted,
unsandboxed code.

Claude Code needs telemetry switched on, and must not set `OTEL_RESOURCE_ATTRIBUTES`
itself. A value in `~/.claude/settings.json` beats the launch environment, and this
plugin's value is then ignored.

## Matching terminal sessions

Paseo execs the agent binary from its daemon, so this plugin never sees a session you start by
typing `claude` in a terminal. `shell/claude-otel-tag.zsh` is the counterpart for those: a zsh
function that sets the same `project`, `host.name`, `host.id`, `service.instance.id` and
`vcs.ref.head.name` from the shell. Source it from your zsh configuration.

It cannot set `project.name`, `project.kind` or the `paseo.*` attributes, since a shell launch has
no agent or workspace behind it. Everything else matches, so the same directory produces the same
project label either way.

## Caveats

- The hook runs when a session opens. Agents already running keep their old environment
  until they restart or resume.
- `paseo.agent_id` is one label value per agent. On a metrics backend that charges for series,
  this is the expensive attribute. `OTEL_METRICS_INCLUDE_RESOURCE_ATTRIBUTES=false` keeps custom
  attributes in the OTLP resource block and off datapoint labels, which we have not measured.
  Dropping the line from `server/attributes.ts` is the other option.
- Each distinct directory is its own label value, so scratch directories add cardinality.
  Worktrees do not, since they resolve to their project root.
- Non-ASCII collapses to `_`, so two directories differing only in an umlaut end up merged.

## Development

```bash
npm install
npm test          # unit tests for the attribute builder
npm run typecheck
paseo plugin install "$PWD"
paseo plugin reload paseo-otel-project-tag
paseo plugin logs paseo-otel-project-tag
```

The tests cover `server/attributes.ts`, which is pure. Anything touching the daemon is verified by
launching a throwaway agent and reading `paseo plugin logs`, which is also how
`docs/paseo-metadata.md` was written.

MIT licensed.
