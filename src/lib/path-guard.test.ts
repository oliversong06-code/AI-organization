import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveWorkspacePath, resolveApprovedExternalPath, PathTraversalError } from "./path-guard";

describe("resolveWorkspacePath", () => {
  it("resolves a normal relative path inside the workspace", () => {
    const resolved = resolveWorkspacePath("workspace/artifacts/report.md");
    expect(resolved).toBe(path.resolve(process.cwd(), "workspace/artifacts/report.md"));
  });

  it.each([
    "../outside.txt",
    "../../etc/passwd",
    "workspace/../../outside.txt",
    "..\\..\\Windows\\System32\\config",
  ])("throws PathTraversalError for %s", (attempt) => {
    expect(() => resolveWorkspacePath(attempt)).toThrow(PathTraversalError);
  });

  it("throws for an absolute path outside the workspace", () => {
    const outsideAbs =
      process.platform === "win32" ? "C:\\Windows\\System32\\drivers\\etc\\hosts" : "/etc/passwd";
    expect(() => resolveWorkspacePath(outsideAbs)).toThrow(PathTraversalError);
  });
});

describe("resolveApprovedExternalPath", () => {
  const approvedRoot = path.join(process.cwd(), "_fixture-external-root");

  it("resolves a file inside the approved root", () => {
    const resolved = resolveApprovedExternalPath(approvedRoot, "manifest.json");
    expect(resolved).toBe(path.resolve(approvedRoot, "manifest.json"));
  });

  it.each(["../secrets.txt", "../../etc/passwd", "..\\..\\escape.txt"])(
    "throws PathTraversalError for %s even for an approved external root",
    (attempt) => {
      expect(() => resolveApprovedExternalPath(approvedRoot, attempt)).toThrow(PathTraversalError);
    }
  );
});
