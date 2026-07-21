import type { Prisma } from "@/generated/prisma/client";
import type { ReviewChainMode } from "@/lib/enums";

type TxClient = Prisma.TransactionClient;

function rangeAsc(from: number, to: number): number[] {
  const out: number[] = [];
  for (let r = from; r <= to; r++) out.push(r);
  return out;
}

/**
 * The single source of truth for turning a ReviewPolicy.chainMode + the
 * artifact author's rank into an ordered list of required reviewer ranks.
 * An empty array means no valid chain exists for this author (they're
 * already at/above every rank the policy could ever require) — the caller
 * treats that as `review_blocked`.
 *
 *  - author_plus_one:      exactly one reviewer, one rank above the author.
 *  - sequential_to_rank3:  every rank from author+1 up to 3 in order; if
 *                          the author is already rank 3+, that collapses
 *                          to a single reviewer at author+1 (still capped
 *                          at 4) since "higher than the author" wins over
 *                          "at least rank 3" once they conflict.
 *  - min3_then_rank4:      rank 3 then rank 4, skipping either stage the
 *                          author's own rank already clears.
 *  - full_chain_rank4:     every rank from author+1 through 4, in order —
 *                          the strictest mode.
 */
export function computeRequiredReviewRanks(chainMode: ReviewChainMode, authorRank: number): number[] {
  switch (chainMode) {
    case "author_plus_one": {
      const next = authorRank + 1;
      return next <= 4 ? [next] : [];
    }
    case "sequential_to_rank3": {
      const upper = Math.min(Math.max(3, authorRank + 1), 4);
      return rangeAsc(authorRank + 1, upper);
    }
    case "min3_then_rank4":
      return [3, 4].filter((r) => r > authorRank);
    case "full_chain_rank4":
      return rangeAsc(authorRank + 1, 4);
    default:
      return [];
  }
}

/**
 * Finds a live candidate reviewer for `requiredRank`, excluding the
 * artifact's own author (self-review is never allowed) and archived
 * employees. Prefers someone in `preferDepartmentId` and falls back to a
 * company-wide search — matches the plan's "같은 부서에 없으면 전사에서
 * 탐색" rule. Returns null (→ review_blocked upstream) when nobody
 * currently qualifies.
 */
export async function findReviewerCandidate(
  tx: TxClient,
  options: { requiredRank: number; excludeEmployeeId: string; preferDepartmentId?: string | null }
) {
  const baseWhere = {
    rank: options.requiredRank,
    status: { not: "archived" },
    id: { not: options.excludeEmployeeId },
  };

  if (options.preferDepartmentId) {
    const inDepartment = await tx.employee.findFirst({
      where: { ...baseWhere, departmentId: options.preferDepartmentId },
      orderBy: { createdAt: "asc" },
    });
    if (inDepartment) return inDepartment;
  }

  return tx.employee.findFirst({ where: baseWhere, orderBy: { createdAt: "asc" } });
}
