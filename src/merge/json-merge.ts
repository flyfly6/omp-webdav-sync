import type { ConflictStrategy, MergeConflict } from "../types.js";
import { isPlatformMismatchedPath } from "../sidecar/sidecar.js";

function isPlainObject(item: unknown): item is Record<string, unknown> {
  return typeof item === "object" && item !== null && !Array.isArray(item);
}

function areValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      return false;
    }
    return keysA.every(k => areValuesEqual(a[k], b[k]));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((val, i) => areValuesEqual(val, b[i]));
  }
  return false;
}

export function merge3WayJson(
  base: Record<string, unknown> | null | undefined,
  local: Record<string, unknown> | null | undefined,
  remote: Record<string, unknown> | null | undefined,
  options: {
    strategy?: ConflictStrategy;
    fieldPath?: string;
  } = {},
): {
  merged: Record<string, unknown>;
  conflicts: MergeConflict[];
} {
  const strategy = options.strategy || "local-wins";
  const parentPath = options.fieldPath || "";
  const conflicts: MergeConflict[] = [];

  const bObj = isPlainObject(base) ? base : {};
  const lObj = isPlainObject(local) ? local : {};
  const rObj = isPlainObject(remote) ? remote : {};

  const allKeys = Array.from(new Set([...Object.keys(bObj), ...Object.keys(lObj), ...Object.keys(rObj)]));
  const merged: Record<string, unknown> = {};

  for (const key of allKeys) {
    const b = bObj[key];
    const l = lObj[key];
    const r = rObj[key];
    const currentPath = parentPath ? `${parentPath}.${key}` : key;

    // 1. Local and Remote made the exact same change
    if (areValuesEqual(l, r)) {
      if (l !== undefined) {
        merged[key] = l;
      }
      continue;
    }

    // 2. Only Remote changed (Local equals Base)
    if (areValuesEqual(l, b)) {
      if (r !== undefined) {
        merged[key] = r;
      }
      // If r is undefined, it means Remote deleted key, so omit from merged
      continue;
    }

    // 3. Only Local changed (Remote equals Base)
    if (areValuesEqual(r, b)) {
      if (l !== undefined) {
        merged[key] = l;
      }
      // If l is undefined, it means Local deleted key, so omit from merged
      continue;
    }

    // 4. Both changed differently
    // Both are objects -> recurse
    if (isPlainObject(l) && isPlainObject(r)) {
      const nested = merge3WayJson(
        isPlainObject(b) ? b : {},
        l,
        r,
        { strategy, fieldPath: currentPath },
      );
      merged[key] = nested.merged;
      conflicts.push(...nested.conflicts);
      continue;
    }

    // Both are arrays
    if (Array.isArray(l) && Array.isArray(r)) {
      const isPrimitiveArray = (arr: unknown[]) =>
        arr.every(item => typeof item === "string" || typeof item === "number" || typeof item === "boolean");

      if (isPrimitiveArray(l) && isPrimitiveArray(r)) {
        // Union primitives preserving local order and adding distinct remote items
        const union = [...l];
        for (const item of r) {
          if (!union.includes(item)) {
            union.push(item);
          }
        }
        merged[key] = union;
        continue;
      }
    }

    // Platform mismatch heuristic: preserve valid local platform paths
    if (typeof l === "string" && typeof r === "string") {
      if (!isPlatformMismatchedPath(l) && isPlatformMismatchedPath(r)) {
        merged[key] = l;
        continue;
      }
      if (isPlatformMismatchedPath(l) && !isPlatformMismatchedPath(r)) {
        merged[key] = r;
        continue;
      }
    }

    // Scalar conflict: resolve according to strategy
    const resolvedValue = strategy === "remote-wins" ? (r !== undefined ? r : l) : (l !== undefined ? l : r);
    merged[key] = resolvedValue;

    conflicts.push({
      path: currentPath,
      field: key,
      baseValue: b,
      localValue: l,
      remoteValue: r,
      resolvedValue,
      strategy,
    });
  }

  return { merged, conflicts };
}
