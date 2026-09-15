import type { PluginHookContext } from "@getpaseo/plugin/server";

type PaseoApi = PluginHookContext["paseo"];

/**
 * Directory a session should be attributed to.
 *
 * A Paseo worktree workspace runs in ~/.paseo/worktrees/<slug>/<name>, which says
 * nothing about the project it branched from. The workspace carries its project's
 * root path, so prefer that and fall back to the session's own cwd.
 *
 * See docs/paseo-metadata.md for everything else this object exposes.
 */
export async function resolveProjectDirectory(
  paseo: PaseoApi,
  workspaceId: string | null | undefined,
  cwd: string,
): Promise<string> {
  if (!workspaceId) return cwd;
  try {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    return workspace?.projectRootPath ?? cwd;
  } catch {
    return cwd;
  }
}
