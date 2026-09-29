import type { ConflictStrategy, MergeResult } from "../types.js";
import { merge3WayJson, merge3WayJsonArray } from "./json-merge.js";
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
      const baseObj = baseContent ? JSON.parse(baseContent) as unknown : null;
      const localObj = JSON.parse(localContent) as unknown;
      const remoteObj = JSON.parse(remoteContent) as unknown;

      if (Array.isArray(localObj) && Array.isArray(remoteObj)) {
        const { merged, conflicts } = merge3WayJsonArray(
          Array.isArray(baseObj) ? baseObj : null,
          localObj,
          remoteObj,
          { strategy, fieldPath: filePath },
        );
        return {
          mergedContent: JSON.stringify(merged, null, 2),
          hasConflicts: conflicts.length > 0,
          conflicts,
        };
      }

      const { merged, conflicts } = merge3WayJson(
        baseObj && typeof baseObj === "object" && !Array.isArray(baseObj) ? (baseObj as Record<string, unknown>) : null,
        localObj && typeof localObj === "object" && !Array.isArray(localObj) ? (localObj as Record<string, unknown>) : {},
        remoteObj && typeof remoteObj === "object" && !Array.isArray(remoteObj) ? (remoteObj as Record<string, unknown>) : {},
        { strategy, fieldPath: filePath },
      );

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
