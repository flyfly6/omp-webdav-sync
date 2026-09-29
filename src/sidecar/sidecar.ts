import * as os from "node:os";

export function getMachineIdentifier(): string {
  const host = os.hostname().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return host || "default-machine";
}

export function normalizePathToTemplate(inputPath: string, homeDir = os.homedir()): string {
  if (!inputPath || typeof inputPath !== "string") {
    return inputPath;
  }

  const normalizedHome = homeDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedInput = inputPath.replace(/\\/g, "/");

  if (normalizedInput === normalizedHome) {
    return "${HOME}";
  }
  if (normalizedInput.startsWith(normalizedHome + "/")) {
    return "${HOME}" + normalizedInput.slice(normalizedHome.length);
  }

  return inputPath;
}

export function expandTemplateToPath(inputPath: string, homeDir = os.homedir()): string {
  if (!inputPath || typeof inputPath !== "string") {
    return inputPath;
  }

  if (inputPath.includes("${HOME}")) {
    const isWindows = process.platform === "win32";
    const targetHome = homeDir;
    let expanded = inputPath.replace(/\$\{HOME\}/g, targetHome.replace(/\\/g, "/"));
    if (isWindows) {
      expanded = expanded.replace(/\//g, "\\");
    }
    return expanded;
  }

  return inputPath;
}

export function isPlatformMismatchedPath(val: string): boolean {
  if (typeof val !== "string") {
    return false;
  }
  const isWindows = process.platform === "win32";
  const hasWindowsDrive = /^[a-zA-Z]:[/\\]/.test(val);
  const hasUnixRoot = /^\/(usr|opt|etc|bin|Users|home)\b/.test(val);

  if (isWindows && hasUnixRoot) {
    return true; // Unix path on Windows
  }
  if (!isWindows && hasWindowsDrive) {
    return true; // Windows path on Unix
  }
  return false;
}

export function extractMachineSidecar(
  data: Record<string, unknown>,
  machineId = getMachineIdentifier(),
): { shared: Record<string, unknown>; sidecar: Record<string, unknown> } {
  const shared: Record<string, unknown> = {};
  const sidecar: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(data)) {
    if (key.includes(`_${machineId}`) || key.endsWith(".local") || key.endsWith(".machine")) {
      sidecar[key] = val;
    } else if (typeof val === "string" && isPlatformMismatchedPath(val)) {
      sidecar[key] = val;
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      const nested = extractMachineSidecar(val as Record<string, unknown>, machineId);
      shared[key] = nested.shared;
      if (Object.keys(nested.sidecar).length > 0) {
        sidecar[key] = nested.sidecar;
      }
    } else {
      shared[key] = val;
    }
  }

  return { shared, sidecar };
}

export function applyMachineSidecar(
  shared: Record<string, unknown>,
  sidecar: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...shared };

  for (const [key, sidecarVal] of Object.entries(sidecar)) {
    const sharedVal = result[key];
    if (
      sharedVal &&
      typeof sharedVal === "object" &&
      !Array.isArray(sharedVal) &&
      sidecarVal &&
      typeof sidecarVal === "object" &&
      !Array.isArray(sidecarVal)
    ) {
      result[key] = applyMachineSidecar(
        sharedVal as Record<string, unknown>,
        sidecarVal as Record<string, unknown>,
      );
    } else {
      result[key] = sidecarVal;
    }
  }

  return result;
}
