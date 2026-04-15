import { supabase } from "@/integrations/supabase/client";
import {
  parseDREFileAuto,
  parseBalancoFileAuto,
  parseBalanceteFileAuto,
  ParsedDREEntry,
  ParsedBalancoEntry,
  ParsedBalanceteEntry,
  BalancoMetrics,
  ValidationRow,
} from "./brazilianParser";
import { extractTextFromPDF } from "./pdfParser";
import { parseFaturamentoFile, parseFaturamentoFromText, type FaturamentoEntry } from "./faturamentoParser";
import type { UploadedFile } from "@/components/MultiFileUpload";

export interface UploadResult {
  success: boolean;
  inserted_dre: number;
  inserted_balanco: number;
  inserted_balancete: number;
  inserted_faturamento: number;
  errors: string[];
  dre_entries?: ParsedDREEntry[];
  balanco_entries?: ParsedBalancoEntry[];
  balancete_entries?: ParsedBalanceteEntry[];
  faturamento_entries?: FaturamentoEntry[];
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
  const ext = file.name.split(".").pop()?.toLowerCase();
  
  if (ext === "pdf") {
    // Extract first page text for identification
    try {
      const { extractTextFromPDF } = await import("./pdfParser");
      const result = await extractTextFromPDF(file);
      const firstLines = result.text.split("\n").filter(l => l.trim()).slice(0, 15);
      return firstLines.length > 0 ? firstLines : [`[PDF] ${file.name}`];
    } catch {
      return [`[PDF] ${file.name}`];
    }
  }

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
  entries: { descricao: string; valor: number; valor_anterior?: number | null; isCMV?: boolean; contexto_pai?: string }[],
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
            isCMV: (e as any).isCMV || false,
            contexto_pai: e.contexto_pai || "",
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

// ============= PDF Processing =============

function isPDF(file: File): boolean {
  return file.name.toLowerCase().endsWith(".pdf");
}

async function processPDFFile(
  file: File,
  fileType: "DRE" | "BALANCETE" | "BALANCO_PATRIMONIAL",
  onProgress?: (stage: string) => void
): Promise<{ entries: any[]; errors: string[] }> {
  const errors: string[] = [];

  // Step 1: Extract text from PDF
  const extraction = await extractTextFromPDF(file, (stage, pct) => {
    onProgress?.(stage);
  });

  if (extraction.errors.length > 0) {
    errors.push(...extraction.errors);
  }

  if (!extraction.text || extraction.text.trim().length < 20) {
    return {
      entries: [],
      errors: [
        ...errors,
        "Não foi possível extrair texto suficiente do PDF. Tente exportar em Excel a partir do seu sistema contabilístico.",
      ],
    };
  }

  // Step 2: Send to AI edge function for structuring
  onProgress?.("IA a estruturar dados do PDF...");

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("No session");

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-pdf-table`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ rawText: extraction.text, fileType }),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: "Erro desconhecido" }));
      return {
        entries: [],
        errors: [...errors, errData.error || `Erro ao processar PDF: ${response.status}`],
      };
    }

    const result = await response.json();
    return { entries: result.entries || [], errors };
  } catch (err) {
    return {
      entries: [],
      errors: [...errors, `Erro ao enviar PDF para processamento: ${err instanceof Error ? err.message : "desconhecido"}`],
    };
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

  // Find DRE, Balanço, Balancete and Faturamento files
  const dreType = fileTypes.find((ft) => ft.tipo === "DRE");
  const balancoType = fileTypes.find((ft) => ft.tipo === "BALANCO_PATRIMONIAL");
  const balanceteType = fileTypes.find((ft) => ft.tipo === "BALANCETE");
  const faturamentoType = fileTypes.find((ft) => ft.tipo === "FATURAMENTO");

  const dreFile = dreType ? files.find((f) => f.file.name === dreType.filename) : undefined;
  const balancoFile = balancoType ? files.find((f) => f.file.name === balancoType.filename) : undefined;
  const balanceteFile = balanceteType ? files.find((f) => f.file.name === balanceteType.filename) : undefined;
  const faturamentoFile = faturamentoType ? files.find((f) => f.file.name === faturamentoType.filename) : undefined;

  if (!dreFile && !balancoFile && !balanceteFile && !faturamentoFile) {
    return {
      success: false,
      inserted_dre: 0,
      inserted_balanco: 0,
      inserted_balancete: 0,
      inserted_faturamento: 0,
      errors: ["Nenhum arquivo foi identificado como DRE, Balanço Patrimonial, Balancete ou Faturamento. Verifique os arquivos enviados."],
      fileTypes: fileTypes as any,
    };
  }

  return uploadAndProcessFiles(
    dreFile?.file || null,
    balancoFile?.file || null,
    userId,
    empresaId,
    onProgress,
    balanceteFile?.file || null,
    faturamentoFile?.file || null
  );
}

export async function uploadAndProcessFiles(
  dreFile: File | null,
  balancoFile: File | null,
  userId: string,
  empresaId?: string,
  onProgress?: (stage: string) => void,
  balanceteFile?: File | null,
  faturamentoFile?: File | null
): Promise<UploadResult> {
  const errors: string[] = [];

  try {
    // Step 1: Clear previous entries
    onProgress?.("Limpando dados anteriores...");
    if (empresaId) {
      await supabase.from("dre_entries").delete().eq("user_id", userId).eq("empresa_id", empresaId);
      await supabase.from("balanco_entries").delete().eq("user_id", userId).eq("empresa_id", empresaId);
      await supabase.from("balancete_entries").delete().eq("user_id", userId).eq("empresa_id", empresaId);
      await supabase.from("faturamento_entries").delete().eq("user_id", userId).eq("empresa_id", empresaId);
    } else {
      await supabase.from("dre_entries").delete().eq("user_id", userId);
      await supabase.from("balanco_entries").delete().eq("user_id", userId);
      await supabase.from("balancete_entries").delete().eq("user_id", userId);
      await supabase.from("faturamento_entries").delete().eq("user_id", userId);
    }

    let dreResult: Awaited<ReturnType<typeof parseDREFileAuto>> | null = null;
    let balancoResult: Awaited<ReturnType<typeof parseBalancoFileAuto>> | null = null;
    let balanceteResult: Awaited<ReturnType<typeof parseBalanceteFileAuto>> | null = null;

    // Step 2: Parse files (PDF or XLS/CSV)
    onProgress?.("Lendo arquivos contábeis...");

    if (dreFile) {
      if (isPDF(dreFile)) {
        onProgress?.("A ler PDF da DRE...");
        const pdfResult = await processPDFFile(dreFile, "DRE", onProgress);
        errors.push(...pdfResult.errors);
        if (pdfResult.entries.length > 0) {
          dreResult = {
            entries: pdfResult.entries.map((e: any) => ({
              descricao: e.descricao || "",
              grupo: "OUTROS",
              valor: e.valor || 0,
              valor_anterior: e.valor_anterior ?? null,
              raw_row: [],
              isCMV: false,
            })),
            periodo: new Date().getFullYear().toString(),
            errors: [],
            parsed: true,
          };
        }
      } else {
        dreResult = await parseDREFileAuto(dreFile);
        errors.push(...dreResult.errors);
      }
    }
    if (balancoFile) {
      if (isPDF(balancoFile)) {
        onProgress?.("A ler PDF do Balanço...");
        const pdfResult = await processPDFFile(balancoFile, "BALANCO_PATRIMONIAL", onProgress);
        errors.push(...pdfResult.errors);
        if (pdfResult.entries.length > 0) {
          balancoResult = {
            entries: pdfResult.entries.map((e: any) => ({
              conta: e.conta || "",
              tipo: e.tipo || "ATIVO_CIRCULANTE",
              valor: e.valor || 0,
              valor_anterior: e.valor_anterior ?? null,
              hierarchy: e.hierarchy || "",
              raw_row: [],
            })),
            metrics: { ativoTotal: 0, ativoCirculante: 0, ativoNaoCirculante: 0, passivoTotal: 0, passivoCirculante: 0, passivoNaoCirculante: 0, patrimonioLiquido: 0 },
            periodo: new Date().getFullYear().toString(),
            errors: [],
            parsed: true,
          };
        }
      } else {
        balancoResult = await parseBalancoFileAuto(balancoFile);
        errors.push(...balancoResult.errors);
      }
    }
    if (balanceteFile) {
      if (isPDF(balanceteFile)) {
        onProgress?.("A ler PDF do Balancete...");
        const pdfResult = await processPDFFile(balanceteFile, "BALANCETE", onProgress);
        errors.push(...pdfResult.errors);
        if (pdfResult.entries.length > 0) {
          balanceteResult = {
            entries: pdfResult.entries.map((e: any) => ({
              conta: e.conta || "",
              grupo: "OUTROS",
              saldo_anterior: e.saldo_anterior || 0,
              debitos: e.debitos || 0,
              creditos: e.creditos || 0,
              saldo_atual: e.saldo_atual || 0,
              natureza: e.natureza || "D",
              raw_row: [],
            })),
            periodo: new Date().getFullYear().toString(),
            errors: [],
            parsed: true,
          };
        }
      } else {
        balanceteResult = await parseBalanceteFileAuto(balanceteFile);
        errors.push(...balanceteResult.errors);
      }
    }

    const dreParsed = !!dreResult?.parsed;
    const balancoParsed = !!balancoResult?.parsed || (balancoResult?.metrics?.ativoTotal ?? 0) !== 0;
    const balanceteParsed = !!balanceteResult?.parsed;

    const hasAnyValidData =
      dreParsed ||
      balancoParsed ||
      balanceteParsed ||
      (dreResult?.entries?.length ?? 0) > 0 ||
      (balancoResult?.entries?.length ?? 0) > 0 ||
      (balanceteResult?.entries?.length ?? 0) > 0;

    if (!hasAnyValidData) {
      return {
        success: false,
        inserted_dre: 0,
        inserted_balanco: 0,
        inserted_balancete: 0,
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
          isCMV: e.isCMV || false,
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

    // Step 3b: AI Classification for Balancete entries
    if (balanceteResult && balanceteResult.entries.length > 0) {
      onProgress?.("IA classificando contas do balancete...");

      const aiResult = await classifyWithAI(
        balanceteResult.entries.map((e) => ({
          descricao: e.conta,
          valor: e.saldo_atual,
          contexto_pai: e.contexto_pai || "",
        })),
        "balancete"
      );

      if (aiResult && aiResult.classifications.length > 0) {
        for (let i = 0; i < balanceteResult.entries.length; i++) {
          const classification = aiResult.classifications[i];
          if (classification) {
            balanceteResult.entries[i].grupo = classification.grupo;
          }
        }
        if (!aiStats) aiStats = aiResult.stats;
        else {
          aiStats.total += aiResult.stats.total;
          aiStats.from_cache += aiResult.stats.from_cache;
          aiStats.from_ai += aiResult.stats.from_ai;
        }
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

    // Step 6: Insert Balancete entries
    let insertedBalancete = 0;
    if (balanceteResult && balanceteResult.entries.length > 0) {
      onProgress?.("Salvando dados do Balancete...");
      const balanceteBatches = chunkArray(balanceteResult.entries, 500);
      for (const batch of balanceteBatches) {
        const { error } = await supabase.from("balancete_entries").insert(
          batch.map((entry) => ({
            user_id: userId,
            empresa_id: empresaId || null,
            periodo: balanceteResult!.periodo,
            conta: entry.conta,
            grupo: entry.grupo,
            saldo_anterior: entry.saldo_anterior,
            debitos: entry.debitos,
            creditos: entry.creditos,
            saldo_atual: entry.saldo_atual,
            natureza: entry.natureza,
            raw_row: entry.raw_row,
          }))
        );
        if (error) {
          errors.push(`Erro ao inserir Balancete: ${error.message}`);
        } else {
          insertedBalancete += batch.length;
        }
      }
    }

    if (dreParsed && insertedDre === 0) {
      errors.push("DRE foi lido, mas nenhuma linha foi materializada para persistência (entries=0).");
    }
    if (balancoParsed && insertedBalanco === 0) {
      errors.push("Balanço foi lido, mas nenhuma linha foi materializada para persistência (entries=0).");
    }
    if (balanceteParsed && insertedBalancete === 0) {
      errors.push("Balancete foi lido, mas nenhuma linha foi materializada para persistência (entries=0).");
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
      success: dreParsed || balancoParsed || balanceteParsed,
      inserted_dre: insertedDre,
      inserted_balanco: insertedBalanco,
      inserted_balancete: insertedBalancete,
      errors,
      dre_entries: dreResult?.entries,
      balanco_entries: balancoResult?.entries,
      balancete_entries: balanceteResult?.entries,
      balanco_metrics: balancoResult?.metrics,
      balanco_validation: balancoResult?.validationRows,
      ai_stats: aiStats,
    };
  } catch (error) {
    return {
      success: false,
      inserted_dre: 0,
      inserted_balanco: 0,
      inserted_balancete: 0,
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
