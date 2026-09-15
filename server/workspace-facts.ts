import type { PluginHookContext } from "@getpaseo/plugin/server";

type PaseoApi = PluginHookContext["paseo"];

export interface WorkspaceFacts {
  /**
   * Project root, which stays on the project even when the session runs in a Paseo
   * worktree under ~/.paseo/worktrees/<slug>/<name>.
   */
  projectRootPath?: string | null;
  projectName?: string | null;
  projectKind?: string | null;
  workspaceKind?: string | null;
  branch?: string | null;
}

/**
 * Workspace metadata for a session, or an empty object when the daemon cannot
 * supply it. Never throws: a failed lookup degrades the labels instead of blocking
 * the session from opening.
 *
 * See docs/paseo-metadata.md for the full shape this reads from.
 */
export async function workspaceFacts(
  paseo: PaseoApi,
  workspaceId: string | null | undefined,
): Promise<WorkspaceFacts> {
  if (!workspaceId) return {};
  try {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    if (!workspace) return {};
    return {
      projectRootPath: workspace.projectRootPath,
      projectName: workspace.projectDisplayName,
      projectKind: workspace.projectKind,
      workspaceKind: workspace.workspaceKind,
      branch: workspace.gitRuntime?.currentBranch,
    };
  } catch {
    return {};
  }
}
