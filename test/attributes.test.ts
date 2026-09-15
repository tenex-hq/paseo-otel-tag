import assert from "node:assert/strict";
import { test } from "node:test";
import { projectTag, resourceAttributes, sanitize } from "../server/attributes.ts";

const base = {
  home: "/home/you",
  hostname: "workstation",
  hostId: "11111111-2222-3333-4444-555555555555",
  instanceId: "workstation",
  agentId: "a1b2c3d4",
  provider: "claude",
  reason: "create",
};

test("project tag is relative to the home directory", () => {
  assert.equal(projectTag("/home/you/code/api", "/home/you"), "code/api");
  assert.equal(projectTag("/home/you", "/home/you"), "home");
  assert.equal(projectTag("/srv/app", "/home/you"), "srv/app");
});

test("project tag replaces characters the OTel spec forbids", () => {
  assert.equal(projectTag("/home/you/my proj,x", "/home/you"), "my_proj_x");
  assert.equal(sanitize('a"b\\c;d e,f'), "a_b_c_d_e_f");
  assert.equal(sanitize("keeps.dots_and-dashes/slashes"), "keeps.dots_and-dashes/slashes");
});

test("a full session carries every attribute", () => {
  const value = resourceAttributes({
    ...base,
    directory: "/home/you/code/api",
    projectName: "api",
    projectKind: "git",
    workspaceKind: "worktree",
    branch: "feat/tags",
  });
  assert.deepEqual(new Map(value.split(",").map((pair) => pair.split("=") as [string, string])), new Map([
    ["service.instance.id", "workstation"],
    ["host.name", "workstation"],
    ["host.id", "11111111-2222-3333-4444-555555555555"],
    ["project", "code/api"],
    ["project.name", "api"],
    ["project.kind", "git"],
    ["paseo.agent_id", "a1b2c3d4"],
    ["paseo.provider", "claude"],
    ["paseo.session_reason", "create"],
    ["paseo.workspace_kind", "worktree"],
    ["vcs.ref.head.name", "feat/tags"],
  ]));
});

test("absent workspace fields are omitted rather than sent empty", () => {
  const value = resourceAttributes({ ...base, directory: "/srv/app", branch: null, projectName: undefined });
  assert.ok(!value.includes("vcs.ref.head.name"));
  assert.ok(!value.includes("project.name"));
  assert.ok(!value.includes("=,") && !value.endsWith("="));
});

test("an override replaces the instance id but not the host name", () => {
  const value = resourceAttributes({ ...base, instanceId: "homelab-01", directory: "/srv/app" });
  assert.match(value, /service\.instance\.id=homelab-01,/);
  assert.match(value, /host\.name=workstation,/);
});

test("branch names with spaces are sanitized", () => {
  const value = resourceAttributes({ ...base, directory: "/srv/app", branch: "feat/two words" });
  assert.match(value, /vcs\.ref\.head\.name=feat\/two_words$/);
});
