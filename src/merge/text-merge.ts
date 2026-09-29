import type { ConflictStrategy, MergeConflict } from "../types.js";

export function merge3WayText(
  filePath: string,
  base: string | null | undefined,
  local: string,
  remote: string,
  strategy: ConflictStrategy = "local-wins",
): {
  mergedContent: string;
  hasConflicts: boolean;
  conflicts: MergeConflict[];
} {
  const conflicts: MergeConflict[] = [];

  if (local === remote) {
    return { mergedContent: local, hasConflicts: false, conflicts: [] };
  }
  if (base !== null && base !== undefined && local === base) {
    return { mergedContent: remote, hasConflicts: false, conflicts: [] };
  }
  if (base !== null && base !== undefined && remote === base) {
    return { mergedContent: local, hasConflicts: false, conflicts: [] };
  }

  const localLines = local.split(/\r?\n/);
  const remoteLines = remote.split(/\r?\n/);

  // Common prefix lines
  let prefixCount = 0;
  while (
    prefixCount < localLines.length &&
    prefixCount < remoteLines.length &&
    localLines[prefixCount] === remoteLines[prefixCount]
  ) {
    prefixCount++;
  }

  // Common suffix lines
  let localSuffix = localLines.length - 1;
  let remoteSuffix = remoteLines.length - 1;
  while (
    localSuffix >= prefixCount &&
    remoteSuffix >= prefixCount &&
    localLines[localSuffix] === remoteLines[remoteSuffix]
  ) {
    localSuffix--;
    remoteSuffix--;
  }

  const localDiff = localLines.slice(prefixCount, localSuffix + 1);
  const remoteDiff = remoteLines.slice(prefixCount, remoteSuffix + 1);

  // If one of the diffs is empty, the other is a clean addition
  let middle: string[];
  let hasConflict = false;

  if (localDiff.length === 0) {
    middle = remoteDiff;
  } else if (remoteDiff.length === 0) {
    middle = localDiff;
  } else {
    // Both sides modified middle lines differently
    hasConflict = true;
    const resolvedDiff = strategy === "remote-wins" ? remoteDiff : localDiff;
    middle = resolvedDiff;
    conflicts.push({
      path: filePath,
      localValue: localDiff.join("\n"),
      remoteValue: remoteDiff.join("\n"),
      resolvedValue: middle.join("\n"),
      strategy,
    });
  }

  const resultLines = [
    ...localLines.slice(0, prefixCount),
    ...middle,
    ...localLines.slice(localSuffix + 1),
  ];

  return {
    mergedContent: resultLines.join("\n"),
    hasConflicts: hasConflict,
    conflicts,
  };
}
