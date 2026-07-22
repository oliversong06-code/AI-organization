// Dev-only generator for public/office/office-empty.svg.
// Not imported by the app at runtime — the app only ever reads the SVG file
// itself. Kept around so the background can be regenerated/tweaked later
// without hand-computing isometric coordinates again.
//
// Usage: node scripts/generate-office-svg.mjs > public/office/office-empty.svg

const VIEW_W = 1600;
const VIEW_H = 1000;

// Top-down floor plan (u,v in [0,1]) -> isometric screen coordinates.
// Matches the OfficeZone rectNorm* values in prisma/seed.ts and
// public/office/office-scene.json.
const ORIGIN_X = 800;
const ORIGIN_Y = 130;
const ISO_W = 1300; // full diamond width in screen px
const ISO_H = 650; // full diamond height in screen px

function iso(u, v) {
  const x = ORIGIN_X + (u - v) * (ISO_W / 2);
  const y = ORIGIN_Y + (u + v) * (ISO_H / 2);
  return [x, y];
}

function fmt(n) {
  return Math.round(n * 10) / 10;
}

function poly(points, fill, extra = "") {
  const d = points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");
  return `<polygon points="${d}" fill="${fill}" ${extra}/>`;
}

// Iso box: (cx,cy) = screen position of the top face's center, hw/hd = top
// face half-width/half-depth in screen px, h = box height (px, downward
// extrusion for the side faces since the box "sits" with its top at cx,cy
// and height drawn going down-screen from there... actually we want boxes
// to sit ON the floor and rise UP, so the top face is ABOVE the floor point
// by `h`, and the two side faces connect the top face down to the floor
// point's rhombus-less base edges).
function isoBox(cx, cy, hw, hd, h, colors) {
  // top face rhombus, elevated by h (drawn upward = smaller y)
  const T = [cx, cy - hd - h];
  const R = [cx + hw, cy - h];
  const B = [cx, cy + hd - h];
  const L = [cx - hw, cy - h];
  // base rhombus (on the floor, h=0)
  const Rb = [cx + hw, cy];
  const Bb = [cx, cy + hd];
  const Lb = [cx - hw, cy];
  const parts = [];
  // left face (L,B top edge down to Lb,Bb)
  parts.push(poly([L, B, Bb, Lb], colors.left));
  // right face (B,R top edge down to Bb,Rb)
  parts.push(poly([B, R, Rb, Bb], colors.right));
  // top face
  parts.push(poly([T, R, B, L], colors.top));
  return parts.join("");
}

function plant(cx, cy, scale = 1) {
  const potColors = { top: "#C98B5C", left: "#A96D42", right: "#8C5934" };
  const parts = [];
  parts.push(isoBox(cx, cy, 14 * scale, 8 * scale, 14 * scale, potColors));
  const foliageCenter = [cx, cy - 14 * scale - 26 * scale];
  parts.push(
    `<ellipse cx="${fmt(foliageCenter[0])}" cy="${fmt(foliageCenter[1])}" rx="${fmt(
      26 * scale
    )}" ry="${fmt(30 * scale)}" fill="#5C9A63"/>`
  );
  parts.push(
    `<ellipse cx="${fmt(foliageCenter[0] - 8 * scale)}" cy="${fmt(
      foliageCenter[1] - 6 * scale
    )}" rx="${fmt(14 * scale)}" ry="${fmt(16 * scale)}" fill="#71AE77"/>`
  );
  return parts.join("");
}

function desk(cx, cy) {
  const deskColors = { top: "#E4E9ED", left: "#B9C2C9", right: "#9AA4AC" };
  const monitorColors = { top: "#3B4046", left: "#2A2E33", right: "#22262A" };
  const parts = [];
  parts.push(isoBox(cx, cy, 34, 20, 22, deskColors));
  parts.push(isoBox(cx - 4, cy - 4, 9, 3, 16, monitorColors));
  return parts.join("");
}

function shelf(cx, cy) {
  const colors = { top: "#E7C878", left: "#CBA956", right: "#AE8C3F" };
  const parts = [];
  parts.push(isoBox(cx, cy, 20, 12, 46, colors));
  for (let i = 1; i <= 2; i++) {
    const [lx, ly] = [cx - 20, cy - i * 14];
    const [rx, ry] = [cx, cy - i * 14 - 12];
    parts.push(
      `<line x1="${fmt(lx)}" y1="${fmt(ly)}" x2="${fmt(rx)}" y2="${fmt(
        ry
      )}" stroke="#8C7128" stroke-width="1.5" opacity="0.6"/>`
    );
  }
  return parts.join("");
}

function crate(cx, cy, tint) {
  const colors = {
    top: tint,
    left: shade(tint, -18),
    right: shade(tint, -34),
  };
  return isoBox(cx, cy, 13, 9, 13, colors);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt;
  let g = ((n >> 8) & 0xff) + amt;
  let b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function sofa(cx, cy) {
  const seatColors = { top: "#F2C555", left: "#D6A937", right: "#B98E27" };
  const backColors = { top: "#F6D372", left: "#D6A937", right: "#B98E27" };
  const parts = [];
  parts.push(isoBox(cx, cy, 30, 16, 14, seatColors));
  parts.push(isoBox(cx - 14, cy - 6, 30, 4, 26, backColors));
  return parts.join("");
}

function table(cx, cy, w, d) {
  const colors = { top: "#E7E1D6", left: "#C9C2B4", right: "#AEA895" };
  return isoBox(cx, cy, w, d, 16, colors);
}

function printer(cx, cy) {
  const colors = { top: "#DADFE3", left: "#B7BEC4", right: "#98A0A6" };
  return isoBox(cx, cy, 16, 12, 16, colors);
}

// ── Floor & walls ───────────────────────────────────────────────────────

const FLOOR_TOP = iso(0, 0);
const FLOOR_RIGHT = iso(1, 0);
const FLOOR_BOTTOM = iso(1, 1);
const FLOOR_LEFT = iso(0, 1);

const WALL_H = 210;

function wallBand(pStart, pEnd, height, colorTop, colorSide) {
  const [x1, y1] = pStart;
  const [x2, y2] = pEnd;
  const top = poly(
    [
      [x1, y1 - height],
      [x2, y2 - height],
      [x2, y2],
      [x1, y1],
    ],
    colorSide
  );
  return top;
}

// two back walls of the cutaway (top-left edge: left->top, top-right edge: top->right)
const wallLeft = wallBand(FLOOR_LEFT, FLOOR_TOP, WALL_H, null, "#F6D98B");
const wallRight = wallBand(FLOOR_TOP, FLOOR_RIGHT, WALL_H, null, "#CBD3D8");

// simple window rectangles on the walls (decorative only)
function windowOnEdge(pStart, pEnd, t0, t1, height0, height1, fill) {
  const lerp = (a, b, t) => a + (b - a) * t;
  const [x1, y1] = pStart;
  const [x2, y2] = pEnd;
  const ax = lerp(x1, x2, t0);
  const ay = lerp(y1, y2, t0);
  const bx = lerp(x1, x2, t1);
  const by = lerp(y1, y2, t1);
  return poly(
    [
      [ax, ay - height1],
      [bx, by - height1],
      [bx, by - height0],
      [ax, ay - height0],
    ],
    fill,
    'opacity="0.85"'
  );
}

const windows = [
  windowOnEdge(FLOOR_LEFT, FLOOR_TOP, 0.12, 0.3, 70, 150, "#FFFFFF"),
  windowOnEdge(FLOOR_LEFT, FLOOR_TOP, 0.4, 0.58, 70, 150, "#FFFFFF"),
  windowOnEdge(FLOOR_TOP, FLOOR_RIGHT, 0.55, 0.72, 70, 150, "#FFFFFF"),
];

// wall clock (decorative)
const clockCenterEdge = iso(0.78, 0.22);
const clock = `
  <circle cx="${fmt(clockCenterEdge[0])}" cy="${fmt(
  clockCenterEdge[1] - 120
)}" r="16" fill="#FFFFFF" stroke="#8C7128" stroke-width="2"/>
  <line x1="${fmt(clockCenterEdge[0])}" y1="${fmt(clockCenterEdge[1] - 120)}" x2="${fmt(
  clockCenterEdge[0]
)}" y2="${fmt(clockCenterEdge[1] - 130)}" stroke="#4A4A4A" stroke-width="2"/>
  <line x1="${fmt(clockCenterEdge[0])}" y1="${fmt(clockCenterEdge[1] - 120)}" x2="${fmt(
  clockCenterEdge[0] + 7
)}" y2="${fmt(clockCenterEdge[1] - 118)}" stroke="#4A4A4A" stroke-width="2"/>
`;

// floor: overall base + tinted room panels
function floorPanel(x0, y0, x1, y1, fill) {
  const p00 = iso(x0, y0);
  const p10 = iso(x1, y0);
  const p11 = iso(x1, y1);
  const p01 = iso(x0, y1);
  return poly([p00, p10, p11, p01], fill);
}

const ZONES = [
  { rect: [0.05, 0.08, 0.38, 0.46], fill: "#F4E9C9", kind: "open_workspace" },
  { rect: [0.05, 0.52, 0.38, 0.92], fill: "#F4E9C9", kind: "open_workspace" },
  { rect: [0.42, 0.08, 0.62, 0.4], fill: "#E9EEF1", kind: "private_office" },
  { rect: [0.42, 0.46, 0.62, 0.78], fill: "#F1E4D3", kind: "meeting_room" },
  { rect: [0.42, 0.82, 0.62, 0.95], fill: "#FBEFD9", kind: "lounge" },
  { rect: [0.66, 0.08, 0.95, 0.92], fill: "#E7EDE7", kind: "artifact_area" },
];

const baseFloor = poly([FLOOR_TOP, FLOOR_RIGHT, FLOOR_BOTTOM, FLOOR_LEFT], "#EFE6D2");
const zonePanels = ZONES.map((z) => floorPanel(...z.rect, z.fill)).join("");

// wall dividers between zones (simple straight partitions along zone edges)
function wallLine(u0, v0, u1, v1) {
  const [x1, y1] = iso(u0, v0);
  const [x2, y2] = iso(u1, v1);
  return `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(
    y2
  )}" stroke="#C9BFA0" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`;
}

const dividers = [
  wallLine(0.4, 0.05, 0.4, 0.95),
  wallLine(0.64, 0.05, 0.64, 0.95),
  wallLine(0.03, 0.49, 0.4, 0.49),
  wallLine(0.42, 0.43, 0.62, 0.43),
  wallLine(0.42, 0.8, 0.62, 0.8),
].join("");

// ── furniture placement per zone ────────────────────────────────────────

const furniture = [];
furniture.push(desk(...iso(0.15, 0.2)));
furniture.push(desk(...iso(0.28, 0.32)));
// open-workspace-1 seats 3-4 (src/lib/office-seats-config.ts normX/normY
// 0.2/0.75 and 0.75/0.25, converted into this zone's rect) — P2-11 added
// desk graphics for every configured seat, not just the first two.
furniture.push(desk(...iso(0.116, 0.365)));
furniture.push(desk(...iso(0.2975, 0.175)));
furniture.push(desk(...iso(0.15, 0.66)));
furniture.push(desk(...iso(0.28, 0.78)));
// open-workspace-2 seats 3-4 (normX/normY 0.2/0.85 and 0.8/0.15)
furniture.push(desk(...iso(0.116, 0.86)));
furniture.push(desk(...iso(0.314, 0.58)));
furniture.push(desk(...iso(0.52, 0.2)));
// private-office-1 seat 2 (normX/normY 0.5/0.75)
furniture.push(desk(...iso(0.52, 0.32)));
furniture.push(shelf(...iso(0.58, 0.12)));
furniture.push(table(...iso(0.52, 0.62), 26, 26));
furniture.push(sofa(...iso(0.5, 0.88)));
furniture.push(table(...iso(0.58, 0.9), 12, 10));
furniture.push(shelf(...iso(0.74, 0.16)));
furniture.push(shelf(...iso(0.86, 0.16)));
furniture.push(printer(...iso(0.78, 0.32)));
furniture.push(crate(...iso(0.86, 0.32), "#EFC96E"));
furniture.push(crate(...iso(0.82, 0.4), "#8FC488"));
furniture.push(crate(...iso(0.9, 0.4), "#7FB6D9"));

furniture.push(plant(...iso(0.06, 0.09), 1.1));
furniture.push(plant(...iso(0.36, 0.94), 1));
furniture.push(plant(...iso(0.63, 0.06), 0.9));
furniture.push(plant(...iso(0.93, 0.9), 1.1));

// Zone labels used to be baked in here as static <text> — P2-8 replaced
// them with ZoneLabelLayer, a client component that reads live
// OfficeZone.displayName from /api/office-zones instead, so this
// generator no longer emits any label markup.

// ── assemble ─────────────────────────────────────────────────────────────

const svg = `<svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="사람이 없는 아이소메트릭 사무실">
  <defs>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="#FCFAF4"/>
  <g filter="url(#soft-shadow)">
    ${wallLeft}
    ${wallRight}
    ${windows.join("")}
    ${clock}
    ${baseFloor}
    ${zonePanels}
    ${dividers}
  </g>
  <g>
    ${furniture.join("")}
  </g>
</svg>
`;

process.stdout.write(svg);
