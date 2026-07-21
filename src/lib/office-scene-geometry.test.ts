import { describe, expect, it } from "vitest";
import { isoProject, resolveEmployeeUV, findZone, type OfficeScene } from "./office-scene-geometry";

const iso = { originX: 800, originY: 130, isoW: 1300, isoH: 650 };

describe("isoProject", () => {
  it("maps the top-down origin (0,0) to the iso origin", () => {
    expect(isoProject(0, 0, iso)).toEqual([800, 130]);
  });

  it("maps (1,1) to originX, originY + isoH", () => {
    const [x, y] = isoProject(1, 1, iso);
    expect(x).toBeCloseTo(800);
    expect(y).toBeCloseTo(130 + 650);
  });

  it("spans the full diamond width between (1,0) and (0,1)", () => {
    const right = isoProject(1, 0, iso);
    const left = isoProject(0, 1, iso);
    expect(right[0] - left[0]).toBeCloseTo(1300);
  });
});

describe("resolveEmployeeUV", () => {
  const zone = {
    key: "open-workspace-1",
    kind: "open_workspace" as const,
    rect: { x0: 0.05, y0: 0.08, x1: 0.38, y1: 0.46 },
  };

  it("maps (0,0) to the zone's top-left corner", () => {
    expect(resolveEmployeeUV(zone, 0, 0)).toEqual([0.05, 0.08]);
  });

  it("maps (1,1) to the zone's bottom-right corner", () => {
    const [u, v] = resolveEmployeeUV(zone, 1, 1);
    expect(u).toBeCloseTo(0.38);
    expect(v).toBeCloseTo(0.46);
  });

  it("maps (0.5,0.5) to the zone's center", () => {
    const [u, v] = resolveEmployeeUV(zone, 0.5, 0.5);
    expect(u).toBeCloseTo((0.05 + 0.38) / 2);
    expect(v).toBeCloseTo((0.08 + 0.46) / 2);
  });
});

describe("findZone", () => {
  const scene: OfficeScene = {
    schemaVersion: 1,
    viewBoxWidth: 1600,
    viewBoxHeight: 1000,
    iso,
    zones: [
      { key: "lounge-1", kind: "lounge", rect: { x0: 0, y0: 0, x1: 1, y1: 1 } },
    ],
  };

  it("finds a zone by key", () => {
    expect(findZone(scene, "lounge-1")?.kind).toBe("lounge");
  });

  it("returns undefined for an unknown key", () => {
    expect(findZone(scene, "does-not-exist")).toBeUndefined();
  });
});
