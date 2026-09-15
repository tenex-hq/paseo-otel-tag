import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hostname, platform } from "node:os";

export interface MachineIdentity {
  /** Stable machine name, suitable for host.name and service.instance.id. */
  name: string;
  /** Stable machine id for host.id, when the platform exposes one. */
  id?: string;
}

function run(command: string, args: string[]): string | undefined {
  try {
    const out = execFileSync(command, args, { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] });
    const value = out.trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function read(path: string): string | undefined {
  try {
    const value = readFileSync(path, "utf8").trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Machine name that survives a network change.
 *
 * `os.hostname()` is not stable on macOS: a DHCP server that supplies a host name sets
 * the system HostName, and the hostname follows it, so the same laptop reports one name
 * at home and another on a corporate network. LocalHostName is the name from the Sharing
 * settings panel and ignores DHCP, so prefer it and drop the trailing .local either way.
 *
 * Linux and the BSDs read the hostname from local configuration, so it is already stable.
 */
export function machineName(): string {
  if (platform() === "darwin") {
    const local = run("scutil", ["--get", "LocalHostName"]);
    if (local) return local.replace(/\.local$/, "");
  }
  return hostname().replace(/\.local$/, "");
}

/** Stable host id, mapped to the OTel host.id attribute. */
export function machineId(): string | undefined {
  if (platform() === "darwin") {
    const ioreg = run("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);
    const match = ioreg?.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    return match?.[1];
  }
  return read("/etc/machine-id") ?? read("/var/lib/dbus/machine-id");
}

/** Resolved once per plugin process; a reload picks up a change. */
export function machineIdentity(): MachineIdentity {
  return { name: machineName(), id: machineId() };
}
