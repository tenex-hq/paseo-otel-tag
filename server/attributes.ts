/** Characters the OTel spec forbids in a resource attribute value. */
export function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9._/-]/g, "_");
}

/**
 * Project tag for a directory.
 *
 * Mirrors the zsh `_claude_project_tag` function used for terminal sessions so both
 * launch paths label the same directory identically.
 */
export function projectTag(directory: string, home: string): string {
  let d: string;
  if (directory === home) {
    d = "home";
  } else if (directory.startsWith(`${home}/`)) {
    d = directory.slice(home.length + 1);
  } else {
    d = directory.replace(/^\//, "");
  }
  return sanitize(d);
}

export interface SessionFacts {
  /** Project root when the workspace knows one, otherwise the session's cwd. */
  directory: string;
  home: string;
  /** Stable machine name, see server/machine.ts. */
  hostname: string;
  /** Stable machine id, when the platform exposes one. */
  hostId?: string;
  /** Explicit override when set, otherwise the machine name. */
  instanceId: string;
  agentId: string;
  provider: string;
  reason: string;
  projectName?: string | null;
  projectKind?: string | null;
  workspaceKind?: string | null;
  branch?: string | null;
}

/**
 * OTEL_RESOURCE_ATTRIBUTES value for one session.
 *
 * Every pair lands on each metric datapoint, event record and span, so only fields
 * that stay constant for the life of the process belong here.
 */
export function resourceAttributes(facts: SessionFacts): string {
  const pairs: Array<[string, string | null | undefined]> = [
    ["service.instance.id", facts.instanceId],
    ["host.name", facts.hostname],
    ["host.id", facts.hostId],
    ["project", projectTag(facts.directory, facts.home)],
    ["project.name", facts.projectName],
    ["project.kind", facts.projectKind],
    ["paseo.agent_id", facts.agentId],
    ["paseo.provider", facts.provider],
    ["paseo.session_reason", facts.reason],
    ["paseo.workspace_kind", facts.workspaceKind],
    ["vcs.ref.head.name", facts.branch],
  ];
  return pairs
    .filter((pair): pair is [string, string] => typeof pair[1] === "string" && pair[1].length > 0)
    .map(([key, value]) => `${key}=${sanitize(value)}`)
    .join(",");
}
