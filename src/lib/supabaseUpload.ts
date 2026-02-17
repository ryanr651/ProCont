import { supabase } from "@/integrations/supabase/client";
import {
  parseDREFileAuto,
  parseBalancoFileAuto,
  ParsedDREEntry,
  ParsedBalancoEntry,
  BalancoMetrics,
  ValidationRow,
} from "./brazilianParser";

export interface UploadResult {
  success: boolean;
  inserted_dre: number;
  inserted_balanco: number;
  errors: string[];
  dre_entries?: ParsedDREEntry[];
  balanco_entries?: ParsedBalancoEntry[];
  balanco_metrics?: BalancoMetrics;
  balanco_validation?: ValidationRow[];
}

export async function uploadAndProcessFiles(dreFile: File, balancoFile: File, userId: string, empresaId?: string): Promise<UploadResult> {
  const errors: string[] = [];

  try {
    // Clear previous entries for this user (and empresa if specified)
    if (empresaId) {
      await supabase.from("dre_entries").delete().eq("user_id", userId).eq("empresa_id", empresaId);
      await supabase.from("balanco_entries").delete().eq("user_id", userId).eq("empresa_id", empresaId);
    } else {
      await supabase.from("dre_entries").delete().eq("user_id", userId);
      await supabase.from("balanco_entries").delete().eq("user_id", userId);
    }

    // Parse DRE file - uses AUTO detection (CSV vs XLS/XLSX)
    const dreResult = await parseDREFileAuto(dreFile);
    errors.push(...dreResult.errors);

    // Parse Balanço file - uses AUTO detection (CSV vs XLS/XLSX)
    const balancoResult = await parseBalancoFileAuto(balancoFile);
    errors.push(...balancoResult.errors);

    // TOLERANT VALIDATION (especialmente para XLS):
    // - Não use `entries.length === 0` como critério único
    // - Dependa da flag `parsed` para saber se houve leitura/interpretação real
    const dreParsed = !!dreResult.parsed;
    const balancoParsed = !!balancoResult.parsed;
    // === XLS SAFE: identifica se EXISTEM valores numéricos válidos ===
    // Para XLS, `parsed === true` já significa leitura correta,
    // mesmo que não existam entries estruturadas.
    const dreHasNumeric = dreParsed === true;

    const balancoHasNumeric = balancoParsed === true || balancoResult.metrics?.ativoTotal !== 0;

    // Log de diagnóstico (temporário)
    console.log("Resumo XLS:", {
      dre_entries: dreResult.entries.length,
      balanco_entries: balancoResult.entries.length,
      ativoTotal: balancoResult.metrics.ativoTotal,
      dreParsed,
      balancoParsed,
    });

    // Log explícito do parsing real (temporário)
    console.log("PARSED RESULT", {
      dre_entries_count: dreResult.entries.length,
      balanco_entries_count: balancoResult.entries.length,
      dre_first_entries: dreResult.entries.slice(0, 5),
      balanco_first_entries: balancoResult.entries.slice(0, 5),
      balanco_metrics: balancoResult.metrics,
    });

    // Validação tolerante: só bloqueia se NENHUM dado foi encontrado
    // XLS com números, mesmo sem estrutura perfeita, não será bloqueado
    const hasAnyValidData =
      dreHasNumeric || balancoHasNumeric || dreResult.entries.length > 0 || balancoResult.entries.length > 0;

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

    // Insert DRE entries in batches
    let insertedDre = 0;
    const dreBatches = chunkArray(dreResult.entries, 500);
    for (const batch of dreBatches) {
      const { error } = await supabase.from("dre_entries").insert(
        batch.map((entry) => ({
          user_id: userId,
          empresa_id: empresaId || null,
          periodo: dreResult.periodo,
          descricao: entry.descricao,
          valor: entry.valor,
          valor_anterior: entry.valor_anterior,
          raw_row: entry.raw_row,
          grupo: entry.grupo,
        })),
      );
      if (error) {
        errors.push(`Erro ao inserir DRE: ${error.message}`);
      } else {
        insertedDre += batch.length;
      }
    }

    // Insert Balanço entries in batches
    let insertedBalanco = 0;
    const balancoBatches = chunkArray(balancoResult.entries, 500);
    for (const batch of balancoBatches) {
      const { error } = await supabase.from("balanco_entries").insert(
        batch.map((entry) => ({
          user_id: userId,
          empresa_id: empresaId || null,
          periodo: balancoResult.periodo,
          conta: entry.conta,
          tipo: entry.tipo,
          valor: entry.valor,
          valor_anterior: entry.valor_anterior,
          hierarchy: entry.hierarchy,
          raw_row: entry.raw_row,
        })),
      );
      if (error) {
        errors.push(`Erro ao inserir Balanço: ${error.message}`);
      } else {
        insertedBalanco += batch.length;
      }
    }

    // Aviso de UX: arquivo foi lido (parsed=true), mas nenhuma linha foi materializada/persistida.
    if (dreParsed && insertedDre === 0) {
      errors.push("DRE foi lido, mas nenhuma linha foi materializada para persistência (entries=0).");
    }
    if (balancoParsed && insertedBalanco === 0) {
      errors.push("Balanço foi lido, mas nenhuma linha foi materializada para persistência (entries=0).");
    }

    // Salvar validação no banco para visualização posterior
    if (balancoResult.validationRows && balancoResult.validationRows.length > 0) {
      // Deletar validação anterior
      await supabase.from("xls_validation_logs").delete().eq("user_id", userId).eq("tipo", "balanco");
      
      // Inserir nova validação
      await supabase.from("xls_validation_logs").insert([{
        user_id: userId,
        tipo: "balanco" as const,
        filename: balancoFile.name,
        validation_rows: JSON.parse(JSON.stringify(balancoResult.validationRows)),
      }]);
    }

    return {
      success: dreParsed || balancoParsed,
      inserted_dre: insertedDre,
      inserted_balanco: insertedBalanco,
      errors,
      dre_entries: dreResult.entries,
      balanco_entries: balancoResult.entries,
      balanco_metrics: balancoResult.metrics,
      balanco_validation: balancoResult.validationRows,
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
