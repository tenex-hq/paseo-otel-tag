import type { PluginHookContext } from "@getpaseo/plugin/server";

type PaseoApi = PluginHookContext["paseo"];

/**
 * Directory a session should be attributed to.
 *
 * A Paseo worktree workspace runs in ~/.paseo/worktrees/<slug>/<name>, which says
 * nothing about the project it branched from. The workspace knows its project, so
 * prefer the project's root directory and fall back to the session's own cwd.
 */
export async function resolveProjectDirectory(
  paseo: PaseoApi,
  workspaceId: string | null | undefined,
  cwd: string,
): Promise<string> {
  if (!workspaceId) return cwd;
  try {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    const projectId = workspace?.projectId;
    if (!projectId) return cwd;

    const { projects } = await paseo.projects.list();
    const project = projects.find((candidate) => candidate.projectId === projectId);
    return project?.projectRootPath ?? cwd;
  } catch {
    return cwd;
  }
}
