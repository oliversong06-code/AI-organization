/** Rendered relative to the avatar-body symbol's 0..100 x 0..132 viewBox,
 * near the head, opposite the status badge. Clicking is handled by the
 * data-artifact-id delegation in OfficeSceneInteractionLayer, same pattern
 * as data-employee-id / data-zone-key. */
export function ArtifactBubble({ artifactId }: { artifactId: string }) {
  return (
    <g data-artifact-id={artifactId} className="cursor-pointer">
      <g transform="translate(14 8)">
        <path
          d="M0 8 a8 8 0 0 1 8 -8 h10 a8 8 0 0 1 8 8 v2 a8 8 0 0 1 -8 8 h-8 l-5 5 v-5 h-5 a8 8 0 0 1 -8 -8 z"
          fill="#FFFFFF"
          stroke="#4CAF6E"
          strokeWidth={1.5}
        />
        <circle cx={7} cy={9} r={1.6} fill="#4CAF6E" />
        <circle cx={13} cy={9} r={1.6} fill="#4CAF6E" />
        <circle cx={19} cy={9} r={1.6} fill="#4CAF6E" />
      </g>
    </g>
  );
}
