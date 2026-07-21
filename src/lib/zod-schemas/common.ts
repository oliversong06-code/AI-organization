import { z } from "zod";

/** Prisma's default cuid() ids — validated loosely (non-empty string) since
 * we don't want API routes to break if the id format ever changes. */
export const idParamSchema = z.object({ id: z.string().min(1) });
