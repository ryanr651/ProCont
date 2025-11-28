import { supabase } from '@/integrations/supabase/client';
import { 
  parseFileToArray, 
  parseDREFile, 
  parseBalancoFile,
  ParsedDREEntry,
  ParsedBalancoEntry
} from './brazilianParser';

export interface UploadResult {
  success: boolean;
  inserted_dre: number;
  inserted_balanco: number;
  errors: string[];
  dre_entries?: ParsedDREEntry[];
  balanco_entries?: ParsedBalancoEntry[];
}

export async function uploadAndProcessFiles(
  dreFile: File,
  balancoFile: File,
  userId: string
): Promise<UploadResult> {
  const errors: string[] = [];

  try {
    // Clear previous entries for this user
    await supabase.from('dre_entries').delete().eq('user_id', userId);
    await supabase.from('balanco_entries').delete().eq('user_id', userId);

    // Parse DRE file
    const dreRows = await parseFileToArray(dreFile);
    const dreResult = parseDREFile(dreRows, dreFile.name);
    errors.push(...dreResult.errors);

    // Parse Balanço file
    const balancoRows = await parseFileToArray(balancoFile);
    const balancoResult = parseBalancoFile(balancoRows, balancoFile.name);
    errors.push(...balancoResult.errors);

    if (dreResult.entries.length === 0 && balancoResult.entries.length === 0) {
      return {
        success: false,
        inserted_dre: 0,
        inserted_balanco: 0,
        errors: errors.length > 0 ? errors : ['Nenhum dado válido encontrado nos arquivos.']
      };
    }

    // Insert DRE entries in batches
    let insertedDre = 0;
    const dreBatches = chunkArray(dreResult.entries, 500);
    for (const batch of dreBatches) {
      const { error } = await supabase.from('dre_entries').insert(
        batch.map(entry => ({
          user_id: userId,
          periodo: dreResult.periodo,
          descricao: entry.descricao,
          valor: entry.valor,
          valor_anterior: entry.valor_anterior,
          raw_row: entry.raw_row
        }))
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
      const { error } = await supabase.from('balanco_entries').insert(
        batch.map(entry => ({
          user_id: userId,
          periodo: balancoResult.periodo,
          conta: entry.conta,
          tipo: entry.tipo,
          valor: entry.valor,
          valor_anterior: entry.valor_anterior,
          hierarchy: entry.hierarchy,
          raw_row: entry.raw_row
        }))
      );
      if (error) {
        errors.push(`Erro ao inserir Balanço: ${error.message}`);
      } else {
        insertedBalanco += batch.length;
      }
    }

    return {
      success: insertedDre > 0 || insertedBalanco > 0,
      inserted_dre: insertedDre,
      inserted_balanco: insertedBalanco,
      errors,
      dre_entries: dreResult.entries,
      balanco_entries: balancoResult.entries
    };
  } catch (error) {
    return {
      success: false,
      inserted_dre: 0,
      inserted_balanco: 0,
      errors: [error instanceof Error ? error.message : 'Erro desconhecido ao processar arquivos.']
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
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
