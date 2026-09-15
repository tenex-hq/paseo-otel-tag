import { homedir } from "node:os";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { resourceAttributes } from "./server/attributes";
import { machineIdentity } from "./server/machine";
import { workspaceFacts } from "./server/workspace-facts";

/**
 * Claude Code emits no attribute for the directory a session runs in, and Paseo
 * execs the agent binary directly, so the shell wrapper that sets this for
 * terminal sessions never runs here. Set it per session instead.
 */
export default function contribute(server: PluginServerContext) {
  // Resolved once per plugin process; `paseo plugin reload` picks up a change.
  const machine = machineIdentity();
  const override =
    process.env.PASEO_OTEL_SERVICE_INSTANCE_ID ?? process.env.OTEL_SERVICE_INSTANCE_ID;

  server.before("agent.session_open", async ({ request }, { paseo }) => {
    if (!request.cwd) return;
    if (request.env?.OTEL_RESOURCE_ATTRIBUTES) return;

    const facts = await workspaceFacts(paseo, request.workspaceId);
    const value = resourceAttributes({
      directory: facts.projectRootPath ?? request.cwd,
      home: homedir(),
      hostname: machine.name,
      hostId: machine.id,
      instanceId: override ?? machine.name,
      agentId: request.agentId,
      provider: request.provider,
      reason: request.reason,
      projectName: facts.projectName,
      projectKind: facts.projectKind,
      workspaceKind: facts.workspaceKind,
      branch: facts.branch,
    });
    console.log(`[otel-tag] ${request.cwd} -> ${value}`);

    return { ...request, env: { ...request.env, OTEL_RESOURCE_ATTRIBUTES: value } };
  });
  return () => {};
}
