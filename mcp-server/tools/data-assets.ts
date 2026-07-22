import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import {
  storeDataAsset,
  updateDataAsset,
  archiveDataAsset,
  linkDataAssetToTask,
  searchDataAssets,
  getDataAssetAndLogAccess,
} from "../../src/lib/direct/dataAssetDirect";
import {
  dataAssetStoreSchema,
  dataAssetUpdateSchema,
  dataAssetSearchSchema,
  dataAssetLinkTaskSchema,
} from "../../src/lib/zod-schemas/direct-data-asset";
import { ok, err } from "../lib/toolResult";

export function registerDataAssetTools(server: McpServer) {
  server.registerTool(
    "store_data_asset",
    {
      title: "데이터 자산 등록",
      description:
        "AI 직원이 업무 중 참고·생성한 내부 자료를 데이터 자산으로 등록합니다(결과물 보관함과 별개 — 사람이 보는 최종 산출물이 아니라 내부 작업 자료용). 파일은 미리 workspace 안에 저장돼 있어야 하며, 이 도구는 파일을 새로 만들지 않습니다. 동일한 내용(checksum 동일)의 활성 데이터 자산이 이미 있으면 새로 만들지 않고 거부합니다.",
      inputSchema: dataAssetStoreSchema.shape,
    },
    async (payload) => {
      const result = await storeDataAsset(payload, "claude_code");
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );

  server.registerTool(
    "list_data_assets",
    {
      title: "데이터 자산 목록 조회",
      description: "보관되지 않은(활성) 데이터 자산 목록을 반환합니다.",
      inputSchema: {},
    },
    async () => {
      const dataAssets = await prisma.dataAsset.findMany({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
      });
      return ok({ dataAssets });
    }
  );

  server.registerTool(
    "get_data_asset",
    {
      title: "데이터 자산 상세 조회",
      description: "id로 데이터 자산 상세 정보를 반환합니다. employeeId/taskId를 넘기면 조회 기록(DataAccessLog)이 남습니다.",
      inputSchema: { id: z.string().min(1), employeeId: z.string().optional(), taskId: z.string().optional() },
    },
    async ({ id, employeeId, taskId }) => {
      const dataAsset = await getDataAssetAndLogAccess(id, { employeeId, taskId });
      if (!dataAsset) return err("데이터 자산을 찾을 수 없습니다", "not_found");
      return ok({ dataAsset });
    }
  );

  server.registerTool(
    "search_data_assets",
    {
      title: "데이터 자산 검색",
      description:
        "이름/설명 텍스트, 데이터 유형, 부서, 민감도로 활성 데이터 자산을 검색합니다. includeExpired가 false(기본값)면 validUntil이 지난 자산은 제외됩니다.",
      inputSchema: dataAssetSearchSchema.shape,
    },
    async (query) => {
      const dataAssets = await searchDataAssets(query);
      return ok({ dataAssets });
    }
  );

  server.registerTool(
    "update_data_asset",
    {
      title: "데이터 자산 정보 수정",
      description:
        "데이터 자산의 일반 정보(이름/설명/유형/부서/소유자/출처 설명/유효기간/민감도)를 수정합니다. storagePath와 checksum은 수정할 수 없습니다(내용이 바뀌면 새 데이터 자산으로 등록).",
      inputSchema: { id: z.string().min(1), data: dataAssetUpdateSchema },
    },
    async ({ id, data }) => {
      const result = await updateDataAsset(id, data, "claude_code");
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );

  server.registerTool(
    "archive_data_asset",
    {
      title: "데이터 자산 보관",
      description: "데이터 자산을 보관 처리합니다(영구 삭제 아님). 내부 작업 자료이므로 사용자 승인 없이 직접 실행됩니다.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const result = await archiveDataAsset(id, "claude_code");
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );

  server.registerTool(
    "link_data_asset_to_task",
    {
      title: "데이터 자산-업무 연결",
      description:
        "데이터 자산이 특정 업무에서 사용(used)되었거나 그 업무의 산출물로 생성(produced)되었음을 기록하고, DataAccessLog에 접근 이력을 남깁니다.",
      inputSchema: dataAssetLinkTaskSchema.shape,
    },
    async ({ dataAssetId, taskId, relation, employeeId }) => {
      const result = await linkDataAssetToTask(dataAssetId, taskId, relation, employeeId, "claude_code");
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );
}
