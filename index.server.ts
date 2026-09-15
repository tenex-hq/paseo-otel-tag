import { homedir } from "node:os";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { resourceAttributes } from "./server/project-tag";

/**
 * Claude Code emits no attribute for the directory a session runs in, and Paseo
 * execs the agent binary directly, so the shell wrapper that sets this for
 * terminal sessions never runs here. Set it per session instead.
 */
export default function contribute(server: PluginServerContext) {
  server.before("agent.session_open", ({ request }) => {
    if (!request.cwd) return;
    if (request.env?.OTEL_RESOURCE_ATTRIBUTES) return;
    return {
      ...request,
      env: {
        ...request.env,
        OTEL_RESOURCE_ATTRIBUTES: resourceAttributes(request.cwd, homedir()),
      },
    };
  });
  return () => {};
}
