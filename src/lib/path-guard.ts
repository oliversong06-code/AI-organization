import path from "node:path";

export class PathTraversalError extends Error {
  constructor(input: string) {
    super(`Path escapes its allowed root: ${input}`);
  }
}

/** Resolves a workspace-relative path (used for artifact files, task
 * inputFiles, etc.) against the project root. Read/write allowed. Throws on
 * any attempt to escape the root (../, absolute paths outside root, etc). */
export function resolveWorkspacePath(relativePath: string): string {
  const root = process.cwd();
  const resolved = path.resolve(root, relativePath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathTraversalError(relativePath);
  }
  return resolved;
}

/** Resolves a path against an explicitly-approved external root (an
 * Integration row's config.syncFolderPath, set only after the user
 * approves it). Read-only by convention — callers must never open these
 * paths for writing. Throws on any attempt to escape that root. */
export function resolveApprovedExternalPath(approvedRoot: string, relativePath: string): string {
  const root = path.resolve(approvedRoot);
  const resolved = path.resolve(root, relativePath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathTraversalError(relativePath);
  }
  return resolved;
}
