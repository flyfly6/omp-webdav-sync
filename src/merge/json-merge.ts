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

const CANDIDATE_ID_KEYS = ["host", "id", "name", "key"];

function findEntityIdKey(arrA: unknown[], arrB: unknown[]): string | null {
  const isObjectArray = (arr: unknown[]) =>
    arr.length > 0 && arr.every(item => isPlainObject(item));

  if (!isObjectArray(arrA) || !isObjectArray(arrB)) {
    return null;
  }

  for (const candidate of CANDIDATE_ID_KEYS) {
    const matchesAllA = (arrA as Array<Record<string, unknown>>).every(
      item => typeof item[candidate] === "string" && item[candidate].length > 0,
    );
    const matchesAllB = (arrB as Array<Record<string, unknown>>).every(
      item => typeof item[candidate] === "string" && item[candidate].length > 0,
    );
    if (matchesAllA && matchesAllB) {
      return candidate;
    }
  }

  return null;
}

export function merge3WayJsonArray(
  base: unknown[] | null | undefined,
  local: unknown[],
  remote: unknown[],
  options: {
    strategy?: ConflictStrategy;
    fieldPath?: string;
  } = {},
): {
  merged: unknown[];
  conflicts: MergeConflict[];
} {
  const strategy = options.strategy || "local-wins";
  const parentPath = options.fieldPath || "";
  const conflicts: MergeConflict[] = [];

  const idKey = findEntityIdKey(local, remote);
  if (idKey) {
    // Entity-aligned merge by idKey
    const baseMap = new Map<string, Record<string, unknown>>();
    if (Array.isArray(base)) {
      for (const item of base) {
        if (isPlainObject(item) && typeof item[idKey] === "string") {
          baseMap.set(item[idKey], item);
        }
      }
    }

    const localMap = new Map<string, Record<string, unknown>>();
    for (const item of local) {
      if (isPlainObject(item) && typeof item[idKey] === "string") {
        localMap.set(item[idKey], item);
      }
    }

    const remoteMap = new Map<string, Record<string, unknown>>();
    for (const item of remote) {
      if (isPlainObject(item) && typeof item[idKey] === "string") {
        remoteMap.set(item[idKey], item);
      }
    }

    const allIds = Array.from(new Set([...localMap.keys(), ...remoteMap.keys()]));
    const mergedList: unknown[] = [];

    for (const id of allIds) {
      const bItem = baseMap.get(id);
      const lItem = localMap.get(id);
      const rItem = remoteMap.get(id);
      const itemPath = `${parentPath}[${id}]`;

      if (lItem && rItem) {
        const nested = merge3WayJson(bItem, lItem, rItem, {
          strategy,
          fieldPath: itemPath,
        });
        mergedList.push(nested.merged);
        conflicts.push(...nested.conflicts);
      } else if (lItem && !rItem) {
        // If remote deleted it, omit; if newly added locally, keep
        if (!bItem) {
          mergedList.push(lItem);
        }
      } else if (!lItem && rItem) {
        // If local deleted it, omit; if newly added remotely, keep
        if (!bItem) {
          mergedList.push(rItem);
        }
      }
    }

    return { merged: mergedList, conflicts };
  }

  // Primitive array union
  const isPrimitiveArray = (arr: unknown[]) =>
    arr.every(item => typeof item === "string" || typeof item === "number" || typeof item === "boolean");

  if (isPrimitiveArray(local) && isPrimitiveArray(remote)) {
    const union = [...local];
    for (const item of remote) {
      if (!union.includes(item)) {
        union.push(item);
      }
    }
    return { merged: union, conflicts: [] };
  }

  // Fallback to strategy
  const resolved = strategy === "remote-wins" ? remote : local;
  return {
    merged: resolved,
    conflicts: [
      {
        path: parentPath,
        localValue: local,
        remoteValue: remote,
        resolvedValue: resolved,
        strategy,
      },
    ],
  };
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
      continue;
    }

    // 3. Only Local changed (Remote equals Base)
    if (areValuesEqual(r, b)) {
      if (l !== undefined) {
        merged[key] = l;
      }
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
      const nestedArray = merge3WayJsonArray(
        Array.isArray(b) ? b : null,
        l,
        r,
        { strategy, fieldPath: currentPath },
      );
      merged[key] = nestedArray.merged;
      conflicts.push(...nestedArray.conflicts);
      continue;
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
