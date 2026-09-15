import { homedir } from "node:os";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { resourceAttributes } from "./server/project-tag";
import { resolveProjectDirectory } from "./server/resolve-project";

/**
 * Claude Code emits no attribute for the directory a session runs in, and Paseo
 * execs the agent binary directly, so the shell wrapper that sets this for
 * terminal sessions never runs here. Set it per session instead.
 */
export default function contribute(server: PluginServerContext) {
  server.before("agent.session_open", async ({ request }, { paseo }) => {
    if (!request.cwd) return;
    if (request.env?.OTEL_RESOURCE_ATTRIBUTES) return;

    const directory = await resolveProjectDirectory(paseo, request.workspaceId, request.cwd);
    const value = resourceAttributes(directory, homedir());
    console.log(`[otel-tag] ${request.cwd} -> ${value}`);

    return { ...request, env: { ...request.env, OTEL_RESOURCE_ATTRIBUTES: value } };
  });
  return () => {};
}
