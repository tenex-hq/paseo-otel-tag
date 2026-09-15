# Tag Claude Code telemetry with the project a session starts in.
#
# Terminal counterpart to the paseo-otel-tag plugin. Paseo execs the agent binary from
# its daemon, so this function never runs for a Paseo agent, and the plugin never runs
# for a shell launch. Both produce the same project, host and branch labels.
#
# OTEL_RESOURCE_ATTRIBUTES must not be set in ~/.claude/settings.json, since a value
# there wins over the environment and this function's value is then ignored.

# Machine name that survives a network change. os.hostname and `hostname` are not
# stable on macOS: a DHCP server that supplies a host name sets the system HostName and
# the hostname follows it. LocalHostName comes from the Sharing settings panel instead.
_claude_otel_machine() {
  if [[ -z "$_CLAUDE_OTEL_MACHINE" ]]; then
    local name=""
    [[ "$(uname -s)" == "Darwin" ]] && name=$(scutil --get LocalHostName 2>/dev/null)
    [[ -z "$name" ]] && name=$(hostname)
    _CLAUDE_OTEL_MACHINE="${name%.local}"
  fi
  print -r -- "$_CLAUDE_OTEL_MACHINE"
}

# Stable host id for the OTel host.id attribute.
_claude_otel_machine_id() {
  if [[ -z "$_CLAUDE_OTEL_MACHINE_ID" ]]; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      _CLAUDE_OTEL_MACHINE_ID=$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null |
        awk -F'"' '/IOPlatformUUID/{print $4}')
    else
      _CLAUDE_OTEL_MACHINE_ID=$(cat /etc/machine-id 2>/dev/null ||
        cat /var/lib/dbus/machine-id 2>/dev/null)
    fi
  fi
  print -r -- "$_CLAUDE_OTEL_MACHINE_ID"
}

_claude_project_tag() {
  local d="$PWD"
  if [[ "$d" == "$HOME" ]]; then d="home"
  elif [[ "$d" == "$HOME"/* ]]; then d="${d#$HOME/}"
  else d="${d#/}"; fi
  print -r -- "${d//[^A-Za-z0-9._\/-]/_}"
}

claude() {
  local machine id branch attrs
  machine=$(_claude_otel_machine)
  attrs="service.instance.id=${OTEL_SERVICE_INSTANCE_ID:-$machine},host.name=$machine"
  id=$(_claude_otel_machine_id)
  [[ -n "$id" ]] && attrs+=",host.id=$id"
  attrs+=",project=$(_claude_project_tag)"
  branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null)
  [[ -n "$branch" ]] && attrs+=",vcs.ref.head.name=${branch//[^A-Za-z0-9._\/-]/_}"
  OTEL_RESOURCE_ATTRIBUTES="$attrs" command claude "$@"
}
