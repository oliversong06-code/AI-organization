import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { idParamSchema } from "@/lib/zod-schemas/common";
import { resolveWorkspacePath, PathTraversalError } from "@/lib/path-guard";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = idParamSchema.parse(await context.params);
  const artifact = await prisma.artifact.findUnique({ where: { id } });
  if (!artifact) {
    return NextResponse.json({ error: "artifact not found" }, { status: 404 });
  }

  try {
    const absolutePath = resolveWorkspacePath(artifact.filePath);
    const data = await fs.readFile(absolutePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": artifact.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(artifact.fileName)}"`,
      },
    });
  } catch (err) {
    if (err instanceof PathTraversalError) {
      return NextResponse.json({ error: "invalid file path" }, { status: 400 });
    }
    return NextResponse.json({ error: "file not found on disk" }, { status: 404 });
  }
}
