import type { ResortState } from "@ski/shared";

/** Download the resort as JSON — a manual backup, nothing reads it back. */
export function exportSave(save: ResortState) {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${save.resortName.replace(/\s+/g, "-").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
