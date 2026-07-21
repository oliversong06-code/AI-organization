import type { EmployeeStatus } from "@/lib/enums";

// Positioned relative to the avatar-body symbol's own 0..100 x 0..132
// viewBox (top-right of the head). completed's full interactive speech
// bubble (click -> artifact detail) is added in step 11; this badge is
// just the at-a-glance status indicator on the marker itself.
const STATUS_STYLE: Record<EmployeeStatus, { bg: string; icon: "dot" | "clock" | "pulse" | "doc" | "exclaim" | "x" | "pause" | "check" }> = {
  idle: { bg: "#9AA4AC", icon: "dot" },
  queued: { bg: "#E6B85C", icon: "clock" },
  running: { bg: "#5FB97A", icon: "pulse" },
  awaiting_approval: { bg: "#5F9BD9", icon: "doc" },
  needs_review: { bg: "#E68A3B", icon: "exclaim" },
  reviewing: { bg: "#8E7CC3", icon: "doc" },
  revision_requested: { bg: "#E68A3B", icon: "exclaim" },
  review_blocked: { bg: "#B54747", icon: "pause" },
  completed: { bg: "#4CAF6E", icon: "check" },
  failed: { bg: "#D9534F", icon: "x" },
  paused: { bg: "#7C8791", icon: "pause" },
  archived: { bg: "#B7BEC4", icon: "dot" },
};

export function StatusBadge({ status }: { status: EmployeeStatus }) {
  const style = STATUS_STYLE[status];
  const cx = 80;
  const cy = 16;

  return (
    <g data-status={status}>
      {style.icon === "pulse" && (
        <circle cx={cx} cy={cy} r={11} fill={style.bg} opacity={0.35}>
          <animate attributeName="r" values="9;14;9" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.45;0;0.45" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={cx} cy={cy} r={10} fill={style.bg} stroke="#FFFFFF" strokeWidth={2.5} />
      {style.icon === "dot" && <circle cx={cx} cy={cy} r={3} fill="#FFFFFF" />}
      {style.icon === "clock" && (
        <g stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round">
          <line x1={cx} y1={cy} x2={cx} y2={cy - 4.5} />
          <line x1={cx} y1={cy} x2={cx + 3.2} y2={cy + 1} />
        </g>
      )}
      {style.icon === "pulse" && <circle cx={cx} cy={cy} r={3.4} fill="#FFFFFF" />}
      {style.icon === "doc" && (
        <rect x={cx - 3.5} y={cy - 4.5} width={7} height={9} rx={1} fill="#FFFFFF" />
      )}
      {style.icon === "exclaim" && (
        <g fill="#FFFFFF">
          <rect x={cx - 1.1} y={cy - 5} width={2.2} height={5.5} rx={1.1} />
          <circle cx={cx} cy={cy + 3.6} r={1.3} />
        </g>
      )}
      {style.icon === "x" && (
        <g stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round">
          <line x1={cx - 3.2} y1={cy - 3.2} x2={cx + 3.2} y2={cy + 3.2} />
          <line x1={cx + 3.2} y1={cy - 3.2} x2={cx - 3.2} y2={cy + 3.2} />
        </g>
      )}
      {style.icon === "pause" && (
        <g fill="#FFFFFF">
          <rect x={cx - 4} y={cy - 4.5} width={2.6} height={9} rx={1} />
          <rect x={cx + 1.4} y={cy - 4.5} width={2.6} height={9} rx={1} />
        </g>
      )}
      {style.icon === "check" && (
        <path
          d={`M${cx - 4} ${cy} l3 3.2 l5.5 -6.4`}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}
