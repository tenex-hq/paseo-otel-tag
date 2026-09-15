/**
 * Derive the telemetry project tag from an agent's working directory.
 *
 * Mirrors the zsh `_claude_project_tag` function in ~/.config/nix-darwin/flake.nix
 * so terminal and Paseo sessions produce identical labels for the same directory.
 */
export function projectTag(cwd: string, home: string): string {
  let d: string;
  if (cwd === home) {
    d = "home";
  } else if (cwd.startsWith(`${home}/`)) {
    d = cwd.slice(home.length + 1);
  } else {
    d = cwd.replace(/^\//, "");
  }
  return d.replace(/[^A-Za-z0-9._/-]/g, "_");
}

/** OTEL_RESOURCE_ATTRIBUTES value for a session started in `cwd`. */
export function resourceAttributes(cwd: string, home: string): string {
  return `service.instance.id=claude-code-mac,project=${projectTag(cwd, home)}`;
}
