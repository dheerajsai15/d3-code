// Tool inputs come off the SDKs typed as `unknown`, so every read is narrowed.
export function readString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function truncate(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

// Absolute paths inside the workspace are noise; show them relative to the root.
export function relativeToWorkspace(workspacePath: string, filePath: string): string {
  const prefix = workspacePath.endsWith("/") ? workspacePath : workspacePath + "/";
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}
