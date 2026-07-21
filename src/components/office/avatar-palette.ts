/** avatarId -> accent color for the shared humanoid sprite (public/avatars/avatar-sprites.svg).
 * Picked from the office's bright/friendly palette so employees read as
 * distinct "coworkers" without any one of them looking special/privileged. */
export const AVATAR_PALETTE: Record<string, string> = {
  "avatar-01": "#F2A65A",
  "avatar-02": "#5FA8D3",
  "avatar-03": "#7FB69E",
  "avatar-04": "#C77DBA",
  "avatar-05": "#E0716A",
  "avatar-06": "#8C9EFF",
};

export const DEFAULT_AVATAR_COLOR = "#9AA4AC";

export function avatarColor(avatarId: string): string {
  return AVATAR_PALETTE[avatarId] ?? DEFAULT_AVATAR_COLOR;
}
