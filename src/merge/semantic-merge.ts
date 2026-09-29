import type { ConflictStrategy, MergeResult } from "../types.js";
import { merge3WayJson } from "./json-merge.js";
import { merge3WayText } from "./text-merge.js";

export function merge3Way(
  filePath: string,
  baseContent: string | null | undefined,
  localContent: string,
  remoteContent: string,
  strategy: ConflictStrategy = "local-wins",
): MergeResult {
  const isJson = filePath.endsWith(".json");

  if (isJson) {
    try {
      const baseObj = baseContent ? JSON.parse(baseContent) as Record<string, unknown> : null;
      const localObj = JSON.parse(localContent) as Record<string, unknown>;
      const remoteObj = JSON.parse(remoteContent) as Record<string, unknown>;

      const { merged, conflicts } = merge3WayJson(baseObj, localObj, remoteObj, {
        strategy,
        fieldPath: filePath,
      });

      return {
        mergedContent: JSON.stringify(merged, null, 2),
        hasConflicts: conflicts.length > 0,
        conflicts,
      };
    } catch {
      // If JSON parsing fails (e.g. malformed or with comments), fallback to text merge
    }
  }

  return merge3WayText(filePath, baseContent, localContent, remoteContent, strategy);
}
