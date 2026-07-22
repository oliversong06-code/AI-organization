import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const artifacts = await prisma.artifact.findMany({
    include: {
      task: { select: { id: true, title: true } },
      department: { select: { id: true, name: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: {
          reviewDecisions: {
            where: { status: "pending" },
            include: { reviewerEmployee: { select: { id: true, name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const employeeIds = [...new Set(artifacts.map((a) => a.employeeId).filter(Boolean))] as string[];
  const employees = employeeIds.length
    ? await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } })
    : [];
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  return NextResponse.json({
    artifacts: artifacts.map((a) => {
      const latest = a.versions[0] ?? null;
      const currentReviewer = latest?.reviewDecisions[0]?.reviewerEmployee ?? null;
      return {
        id: a.id,
        title: a.title,
        summary: a.summary,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        sourceType: a.sourceType,
        importance: a.importance,
        currentReviewStatus: a.currentReviewStatus,
        createdAt: a.createdAt,
        archivedAt: a.archivedAt,
        task: a.task,
        employee: a.employeeId ? employeeById.get(a.employeeId) ?? null : null,
        department: a.department,
        latestVersion: latest ? { versionNumber: latest.versionNumber, format: latest.format } : null,
        currentReviewer,
      };
    }),
  });
}
