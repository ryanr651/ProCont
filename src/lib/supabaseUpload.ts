import { supabase } from "@/integrations/supabase/client";
import {
  parseDREFileAuto,
  parseBalancoFileAuto,
  ParsedDREEntry,
  ParsedBalancoEntry,
  BalancoMetrics,
  ValidationRow,
} from "./brazilianParser";
import type { UploadedFile } from "@/components/MultiFileUpload";

export interface UploadResult {
  success: boolean;
  inserted_dre: number;
  inserted_balanco: number;
  errors: string[];
  dre_entries?: ParsedDREEntry[];
  balanco_entries?: ParsedBalancoEntry[];
  balanco_metrics?: BalancoMetrics;
  balanco_validation?: ValidationRow[];
  ai_stats?: { total: number; from_cache: number; from_ai: number };
  fileTypes?: Array<{ filename: string; tipo: string; confianca: string }>;
}

interface ClassificationResult {
  descricao: string;
  grupo: string;
  motivo: string;
}

// ============= AI: Identify file types =============

async function extractFileHeaders(file: File): Promise<string[]> {
  try {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];
    return data.slice(0, 15).map((row) => row.filter(Boolean).join(" | "));
  } catch {
    return [file.name];
  }
}

export async function identifyFileTypes(
  files: UploadedFile[],
  onProgress?: (stage: string) => void
): Promise<Array<{ filename: string; tipo: string; confianca: string }>> {
  onProgress?.("IA identificando tipos de demonstração...");

  try {
    const fileData = await Promise.all(
      files.map(async (f) => ({
        filename: f.file.name,
        headers: await extractFileHeaders(f.file),
      }))
    );

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("No session");

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/identify-file-type`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ files: fileData }),
      }
    );

    if (!response.ok) {
      console.error("identify-file-type error:", response.status);
      return files.map((f) => ({ filename: f.file.name, tipo: "DESCONHECIDO", confianca: "baixa" }));
    }

    const result = await response.json();
    return result.results || [];
  } catch (error) {
    console.error("identifyFileTypes failed:", error);
    return files.map((f) => ({ filename: f.file.name, tipo: "DESCONHECIDO", confianca: "baixa" }));
  }
}

// ============= AI: Classify accounts =============

async function classifyWithAI(
  entries: { descricao: string; valor: number; valor_anterior?: number | null }[],
  contextoTipo: string
): Promise<{ classifications: ClassificationResult[]; stats: { total: number; from_cache: number; from_ai: number } } | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return null;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-accounts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          entries: entries.map((e, i) => ({
            descricao: e.descricao,
            valor: e.valor,
            valor_anterior: e.valor_anterior,
            posicao_relativa: i,
          })),
          contexto_tipo: contextoTipo,
        }),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("AI classification error:", response.status, errData);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("AI classification failed:", error);
    return null;
  }
}

// ============= Multi-file upload & process =============

export async function uploadAndProcessMultipleFiles(
  files: UploadedFile[],
  fileTypes: Array<{ filename: string; tipo: string }>,
  userId: string,
  empresaId: string,
  onProgress?: (stage: string) => void
): Promise<UploadResult> {
  const errors: string[] = [];

  // Find DRE and Balanço files
  const dreType = fileTypes.find((ft) => ft.tipo === "DRE");
  const balancoType = fileTypes.find((ft) => ft.tipo === "BALANCO_PATRIMONIAL");

  const dreFile = dreType ? files.find((f) => f.file.name === dreType.filename) : undefined;
  const balancoFile = balancoType ? files.find((f) => f.file.name === balancoType.filename) : undefined;

  if (!dreFile && !balancoFile) {
    return {
      success: false,
      inserted_dre: 0,
      inserted_balanco: 0,
      errors: ["Nenhum arquivo foi identificado como DRE ou Balanço Patrimonial. Verifique os arquivos enviados."],
      fileTypes: fileTypes as any,
    };
  }

  return uploadAndProcessFiles(
    dreFile?.file || null,
    balancoFile?.file || null,
    userId,
    empresaId,
    onProgress
  );
}

export async function uploadAndProcessFiles(
  dreFile: File | null,
  balancoFile: File | null,
  userId: string,
  empresaId?: string,
  onProgress?: (stage: string) => void
): Promise<UploadResult> {
  const errors: string[] = [];

  try {
    // Step 1: Clear previous entries
    onProgress?.("Limpando dados anteriores...");
    if (empresaId) {
      await supabase.from("dre_entries").delete().eq("user_id", userId).eq("empresa_id", empresaId);
      await supabase.from("balanco_entries").delete().eq("user_id", userId).eq("empresa_id", empresaId);
    } else {
      await supabase.from("dre_entries").delete().eq("user_id", userId);
      await supabase.from("balanco_entries").delete().eq("user_id", userId);
    }

    let dreResult: Awaited<ReturnType<typeof parseDREFileAuto>> | null = null;
    let balancoResult: Awaited<ReturnType<typeof parseBalancoFileAuto>> | null = null;

    // Step 2: Parse files
    onProgress?.("Lendo arquivos contábeis...");

    if (dreFile) {
      dreResult = await parseDREFileAuto(dreFile);
      errors.push(...dreResult.errors);
    }
    if (balancoFile) {
      balancoResult = await parseBalancoFileAuto(balancoFile);
      errors.push(...balancoResult.errors);
    }

    const dreParsed = !!dreResult?.parsed;
    const balancoParsed = !!balancoResult?.parsed || (balancoResult?.metrics?.ativoTotal ?? 0) !== 0;

    const hasAnyValidData =
      dreParsed ||
      balancoParsed ||
      (dreResult?.entries?.length ?? 0) > 0 ||
      (balancoResult?.entries?.length ?? 0) > 0;

    if (!hasAnyValidData) {
      return {
        success: false,
        inserted_dre: 0,
        inserted_balanco: 0,
        errors: [
          "Não foi possível interpretar a estrutura dos arquivos enviados. Verifique se são arquivos válidos da contabilidade.",
        ],
      };
    }

    // Step 3: AI Classification for DRE entries
    let aiStats: { total: number; from_cache: number; from_ai: number } | undefined;

    if (dreResult && dreResult.entries.length > 0) {
      onProgress?.("IA analisando estrutura contábil...");

      const aiResult = await classifyWithAI(
        dreResult.entries.map((e) => ({
          descricao: e.descricao,
          valor: e.valor,
          valor_anterior: e.valor_anterior,
        })),
        "dre"
      );

      if (aiResult && aiResult.classifications.length > 0) {
        for (let i = 0; i < dreResult.entries.length; i++) {
          const classification = aiResult.classifications[i];
          if (classification) {
            dreResult.entries[i].grupo = classification.grupo;
          }
        }
        aiStats = aiResult.stats;
        console.log("IA classificou:", aiStats);
      } else {
        console.warn("AI classification failed, using parser fallback");
        errors.push("Classificação via IA falhou. Usando classificação local como fallback.");
      }
    }

    // Step 4: Insert DRE entries
    let insertedDre = 0;
    if (dreResult && dreResult.entries.length > 0) {
      onProgress?.("Salvando dados da DRE...");
      const dreBatches = chunkArray(dreResult.entries, 500);
      for (const batch of dreBatches) {
        const { error } = await supabase.from("dre_entries").insert(
          batch.map((entry) => ({
            user_id: userId,
            empresa_id: empresaId || null,
            periodo: dreResult!.periodo,
            descricao: entry.descricao,
            valor: entry.valor,
            valor_anterior: entry.valor_anterior,
            raw_row: entry.raw_row,
            grupo: entry.grupo,
          }))
        );
        if (error) {
          errors.push(`Erro ao inserir DRE: ${error.message}`);
        } else {
          insertedDre += batch.length;
        }
      }
    }

    // Step 5: Insert Balanço entries
    let insertedBalanco = 0;
    if (balancoResult && balancoResult.entries.length > 0) {
      onProgress?.("Salvando dados do Balanço...");
      const balancoBatches = chunkArray(balancoResult.entries, 500);
      for (const batch of balancoBatches) {
        const { error } = await supabase.from("balanco_entries").insert(
          batch.map((entry) => ({
            user_id: userId,
            empresa_id: empresaId || null,
            periodo: balancoResult!.periodo,
            conta: entry.conta,
            tipo: entry.tipo,
            valor: entry.valor,
            valor_anterior: entry.valor_anterior,
            hierarchy: entry.hierarchy,
            raw_row: entry.raw_row,
          }))
        );
        if (error) {
          errors.push(`Erro ao inserir Balanço: ${error.message}`);
        } else {
          insertedBalanco += batch.length;
        }
      }
    }

    if (dreParsed && insertedDre === 0) {
      errors.push("DRE foi lido, mas nenhuma linha foi materializada para persistência (entries=0).");
    }
    if (balancoParsed && insertedBalanco === 0) {
      errors.push("Balanço foi lido, mas nenhuma linha foi materializada para persistência (entries=0).");
    }

    // Save validation logs
    if (balancoFile && balancoResult?.validationRows && balancoResult.validationRows.length > 0) {
      await supabase.from("xls_validation_logs").delete().eq("user_id", userId).eq("tipo", "balanco");
      await supabase.from("xls_validation_logs").insert([{
        user_id: userId,
        tipo: "balanco" as const,
        filename: balancoFile.name,
        validation_rows: JSON.parse(JSON.stringify(balancoResult.validationRows)),
      }]);
    }

    onProgress?.("Concluído!");

    return {
      success: dreParsed || balancoParsed,
      inserted_dre: insertedDre,
      inserted_balanco: insertedBalanco,
      errors,
      dre_entries: dreResult?.entries,
      balanco_entries: balancoResult?.entries,
      balanco_metrics: balancoResult?.metrics,
      balanco_validation: balancoResult?.validationRows,
      ai_stats: aiStats,
    };
  } catch (error) {
    return {
      success: false,
      inserted_dre: 0,
      inserted_balanco: 0,
      errors: [error instanceof Error ? error.message : "Erro desconhecido ao processar arquivos."],
    };
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Generate downloadable JSON
export function generateDownloadableJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
