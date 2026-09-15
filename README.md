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

One `server.before("agent.session_open")` hook sets:

```
OTEL_RESOURCE_ATTRIBUTES=service.instance.id=<instance>,project=<tag>
```

The tag is the working directory relative to `$HOME`:

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

Sessions started from a shell need the same tag computed there. This zsh function produces
output identical to the plugin:

```zsh
_claude_project_tag() {
  local d="$PWD"
  if [[ "$d" == "$HOME" ]]; then d="home"
  elif [[ "$d" == "$HOME"/* ]]; then d="${d#$HOME/}"
  else d="${d#/}"; fi
  print -r -- "${d//[^A-Za-z0-9._\/-]/_}"
}

claude() {
  OTEL_RESOURCE_ATTRIBUTES="service.instance.id=claude-code-mac,project=$(_claude_project_tag)" command claude "$@"
}
```

## Caveats

- The hook runs when a session opens. Agents already running keep their old environment
  until they restart or resume.
- `service.instance.id` is hardcoded to `claude-code-mac` in `server/project-tag.ts`.
  Change it before running this on another machine.
- Each distinct directory is its own label value, so scratch directories add cardinality.
  Worktrees do not, since they resolve to their project root.
- Non-ASCII collapses to `_`, so two directories differing only in an umlaut end up merged.

## Development

```bash
npm install
npm run typecheck
paseo plugin install "$PWD"
paseo plugin reload paseo-otel-project-tag
paseo plugin logs paseo-otel-project-tag
```
