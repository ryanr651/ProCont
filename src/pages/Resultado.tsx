import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProgressBar } from "@/components/ProgressBar";
import { XLSValidationMode, ValidationRow } from "@/components/XLSValidationMode";
import { ManualEditDialog, EditableBalancoEntry, EditableDREEntry } from "@/components/ManualEditDialog";
import { AIAnalysisDialog } from "@/components/AIAnalysisDialog";
import { AIPresentationDialog } from "@/components/AIPresentationDialog";
import { FinancialChatBox } from "@/components/FinancialChatBox";
import { DashboardIndicadores } from "@/components/DashboardIndicadores";
import { DashboardBalancete, type BalanceteClassifiedEntry } from "@/components/DashboardBalancete";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import html2pdf from "html2pdf.js";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Building,
  Scale,
  Landmark,
  RefreshCw,
  DollarSign,
  Receipt,
  Calculator,
  LogOut,
  Loader2,
  FileSearch,
  FileDown,
  Edit3,
  Sparkles,
  Presentation,
  BarChart3,
  Percent,
  ShieldCheck,
  Activity,
  Target,
} from "lucide-react";

interface DREEntry {
  descricao: string;
  valor: number;
  valor_anterior: number | null;
  grupo?: string;
}

interface BalancoEntry {
  conta: string;
  tipo: string;
  valor: number;
  valor_anterior: number | null;
  hierarchy: string;
}

interface DiagnosticLine {
  conta: string;
  valor: number;
  valorAnterior: number | null;
  colunaUsada: 'atual' | 'anterior' | 'nenhuma';
  encontrado: boolean;
  secao: 'ATIVO' | 'PASSIVO' | 'PL' | '-';
  tipoClassificado: string;
  motivo: string;
}

interface CalculatedDRE {
  receitaBruta: number;
  receitaBrutaOrigem: 'linha_explicita' | 'soma_contas';
  receitaLiquida: number;
  receitaLiquidaOrigem: 'linha_explicita' | 'soma_contas';
  cmv: number;
  cmvOrigem: 'linha_explicita' | 'soma_contas';
  lucroBruto: number;
  lucroBrutoOrigem: 'linha_explicita' | 'soma_contas';
  despesasOperacionais: number;
  despesasOperacionaisOrigem: 'linha_explicita' | 'soma_contas';
  lucroOperacional: number;
  lucroOperacionalOrigem: 'linha_explicita' | 'soma_contas';
  resultadoFinanceiro: number;
  resultadoFinanceiroOrigem: 'linha_explicita' | 'soma_contas';
  contribuicaoSocial: number;
  contribuicaoSocialOrigem: 'linha_explicita' | 'soma_contas';
  lucroLiquido: number;
  lucroLiquidoOrigem: 'linha_explicita' | 'soma_contas';
  // Margens calculadas
  margemBruta: number;
  margemOperacional: number;
  margemLiquida: number;
}

interface CalculatedBalanco {
  ativoCirculante: number;
  ativoNaoCirculante: number;
  ativoTotal: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
  passivoTotal: number;
  patrimonioLiquido: number;
}

/**
 * Normalize text for comparison (remove accents, uppercase)
 */
function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Types for DRE classification debug
interface DREClassifiedEntry {
  descricao: string;
  valor: number;
  valorAnterior: number | null;
  grupo: 'receita_bruta' | 'receita_liquida' | 'cmv' | 'lucro_bruto' | 'despesas_operacionais' | 'lucro_operacional' | 'resultado_financeiro' | 'nao_operacional' | 'contribuicao_social' | 'ir' | 'lucro_liquido' | 'contas_resultado' | 'provisoes';
  isExplicit: boolean;
  motivo: string;
  insideCMVBlock?: boolean;
}

interface EmpresaData {
  nome: string;
  cnpj: string;
  cnae: string;
  regime_tributario: string;
  contexto: string | null;
}

const Resultado = () => {
  const [loading, setLoading] = useState(true);
  const [dreData, setDreData] = useState<CalculatedDRE | null>(null);
  const [balancoData, setBalancoData] = useState<CalculatedBalanco | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [diagnosticLines, setDiagnosticLines] = useState<DiagnosticLine[]>([]);
  const [validationRows, setValidationRows] = useState<ValidationRow[]>([]);
  const [validationFilename, setValidationFilename] = useState<string>("balanco.xls");
  const [showValidation, setShowValidation] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [dreClassifiedEntries, setDreClassifiedEntries] = useState<DREClassifiedEntry[]>([]);
  const [showDreDebug, setShowDreDebug] = useState(false);
  
  // Manual edit state
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [isApplyingChanges, setIsApplyingChanges] = useState(false);
  const [rawBalancoEntries, setRawBalancoEntries] = useState<BalancoEntry[]>([]);
  const [rawDreEntries, setRawDreEntries] = useState<DREEntry[]>([]);
  
  // AI Analysis state
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  
  // AI Presentation state
  const [showAIPresentation, setShowAIPresentation] = useState(false);

  // Balancete state
  const [balanceteEntries, setBalanceteEntries] = useState<BalanceteClassifiedEntry[]>([]);

  // Empresa context
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaData | null>(null);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const empresaIdParam = searchParams.get("empresa_id");
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    loadData();
  }, [user, navigate, empresaIdParam]);

  const loadData = async () => {
    if (!user) return;

    try {
      // Build query filters
      let dreQuery = supabase.from('dre_entries').select('*').eq('user_id', user.id);
      let balancoQuery = supabase.from('balanco_entries').select('*').eq('user_id', user.id);
      let balanceteQuery = supabase.from('balancete_entries').select('*').eq('user_id', user.id);

      if (empresaIdParam) {
        dreQuery = dreQuery.eq('empresa_id', empresaIdParam);
        balancoQuery = balancoQuery.eq('empresa_id', empresaIdParam);
        balanceteQuery = balanceteQuery.eq('empresa_id', empresaIdParam);
      }

      // Load DRE entries
      const { data: dreEntries, error: dreError } = await dreQuery;
      if (dreError) throw dreError;

      // Load Balanço entries
      const { data: balancoEntries, error: balancoError } = await balancoQuery;
      if (balancoError) throw balancoError;

      // Load Balancete entries
      const { data: balanceteData, error: balanceteError } = await balanceteQuery;
      if (balanceteError) throw balanceteError;

      if (balanceteData && balanceteData.length > 0) {
        setBalanceteEntries(balanceteData.map((e: any) => ({
          conta: e.conta,
          grupo: e.grupo || 'OUTROS',
          saldo_anterior: Number(e.saldo_anterior) || 0,
          debitos: Number(e.debitos) || 0,
          creditos: Number(e.creditos) || 0,
          saldo_atual: Number(e.saldo_atual) || 0,
          natureza: e.natureza || 'devedora',
        })));
      }

      if (!dreEntries?.length && !balancoEntries?.length && !balanceteData?.length) {
        navigate("/upload");
        return;
      }

      // Calculate DRE metrics and classify entries
      const { metrics: dre, classifiedEntries } = calculateDREMetricsWithClassification(dreEntries as DREEntry[]);
      setDreData(dre);
      setDreClassifiedEntries(classifiedEntries);

      // Calculate Balanço metrics from key lines
      const balanco = calculateBalancoMetrics(balancoEntries as BalancoEntry[]);
      setBalancoData(balanco);
      
      // Store raw entries for manual editing
      setRawBalancoEntries(balancoEntries as BalancoEntry[]);
      setRawDreEntries(dreEntries as DREEntry[]);

      // Generate diagnostic lines for debugging
      const diagnostic = generateDiagnosticLines(balancoEntries as BalancoEntry[]);
      setDiagnosticLines(diagnostic);

      // Load validation logs from database
      const { data: validationLogs } = await supabase
        .from("xls_validation_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("tipo", "balanco")
        .order("created_at", { ascending: false })
        .limit(1);

      if (validationLogs && validationLogs.length > 0) {
        const log = validationLogs[0];
        // Cast from Json to ValidationRow[]
        const rows = (log.validation_rows as unknown) as ValidationRow[];
        setValidationRows(Array.isArray(rows) ? rows : []);
        setValidationFilename(log.filename || "balanco.xls");
      }

      // Load empresa data
      if (empresaIdParam) {
        const { data: empresas } = await supabase
          .from("empresas")
          .select("nome, cnpj, cnae, regime_tributario, contexto")
          .eq("id", empresaIdParam)
          .eq("user_id", user.id)
          .limit(1);

        if (empresas && empresas.length > 0) {
          setSelectedEmpresa(empresas[0]);
        }
      }

      // Generate insights
      setInsights(generateInsights(dre, balanco));
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Classify a DRE entry into its group
   */
  const classifyDREEntry = (descNormalized: string, descOriginal: string, valor: number): { grupo: DREClassifiedEntry['grupo']; isExplicit: boolean; motivo: string } => {
    const desc = descNormalized;
    // ===== RECEITA BRUTA =====
    if (desc.includes('RECEITA BRUTA') || desc.includes('RECEITA OPERACIONAL BRUTA')) {
      const isExplicit = desc === 'RECEITA BRUTA' || desc === 'RECEITA OPERACIONAL BRUTA' || desc.includes('TOTAL');
      return { 
        grupo: 'receita_bruta', 
        isExplicit, 
        motivo: isExplicit ? 'Linha explícita de Receita Bruta' : 'Componente da Receita Bruta' 
      };
    }
    // Vendas/serviços/faturamento são classificados pelo bloco do parser, não por keyword aqui

    // ===== RECEITA LÍQUIDA =====
    if (desc.includes('RECEITA LIQUIDA') || desc.includes('RECEITA OPERACIONAL LIQUIDA')) {
      return { grupo: 'receita_liquida', isExplicit: true, motivo: 'Linha explícita de Receita Líquida' };
    }

    // ===== CMV =====
    if (desc.includes('CMV') || desc.includes('CPV') || 
        desc.includes('CUSTO DA MERCADORIA') || desc.includes('CUSTO DAS MERCADORIAS') ||
        desc.includes('CUSTO DOS PRODUTOS') || desc.includes('CUSTO DOS SERVICOS')) {
      const isExplicit = desc === 'CMV' || desc === 'CPV' || 
                         desc === 'CUSTO DA MERCADORIA VENDIDA' || 
                         desc === 'CUSTO DAS MERCADORIAS VENDIDAS' ||
                         desc === 'CUSTO DOS PRODUTOS VENDIDOS' ||
                         desc === 'CUSTO DOS SERVICOS PRESTADOS' ||
                         desc.includes('TOTAL');
      return { grupo: 'cmv', isExplicit, motivo: isExplicit ? 'Linha explícita de CMV' : 'Componente de CMV' };
    }

    // ===== LUCRO BRUTO =====
    if (desc === 'LUCRO BRUTO' || desc === 'RESULTADO BRUTO') {
      return { grupo: 'lucro_bruto', isExplicit: true, motivo: 'Linha explícita de Lucro Bruto' };
    }


    // ===== DESPESAS OPERACIONAIS =====
    if (desc.includes('DESPESAS OPERACIONAIS') || desc.includes('DESPESAS ADMINISTRATIVAS') ||
        desc.includes('DESPESAS COM VENDAS') || desc.includes('DESPESAS GERAIS') ||
        desc.includes('DESPESAS TRABALHISTAS')) {
      const isExplicit = desc === 'DESPESAS OPERACIONAIS' || 
                         desc === 'TOTAL DESPESAS OPERACIONAIS' ||
                         desc === 'TOTAL DAS DESPESAS OPERACIONAIS' ||
                         (desc.includes('TOTAL') && desc.includes('DESPESAS'));
      return { grupo: 'despesas_operacionais', isExplicit, motivo: isExplicit ? 'Linha explícita de Despesas Operacionais' : 'Componente de Despesas Operacionais' };
    }

    // ===== LUCRO OPERACIONAL =====
    // Inclui: LUCRO OPERACIONAL, RESULTADO OPERACIONAL, e qualquer conta com "OPERACIONAL LIQUIDO"
    if (desc === 'LUCRO OPERACIONAL' || desc === 'RESULTADO OPERACIONAL' || desc.includes('OPERACIONAL LIQUIDO')) {
      return { grupo: 'lucro_operacional', isExplicit: true, motivo: 'Linha explícita de Lucro Operacional' };
    }

    // ===== NÃO OPERACIONAL (categoria separada) =====
    // Detectar itens NÃO OPERACIONAIS (com ou sem acento, maiúsculo/minúsculo)
    const isNaoOperacional = desc.includes('NAO OPERACIONAL') || 
                             desc.includes('NÃO OPERACIONAL') ||
                             desc.includes('NAO OPERACIONAIS') ||
                             desc.includes('NÃO OPERACIONAIS') ||
                             descOriginal.toUpperCase().includes('NÃO OPERACIONAL') ||
                             descOriginal.toUpperCase().includes('NAO OPERACIONAL');
    
    if (isNaoOperacional) {
      return { grupo: 'nao_operacional', isExplicit: false, motivo: 'Item Não Operacional' };
    }

    // ===== ALIENAÇÃO → NÃO OPERACIONAL =====
    if (desc.includes('ALIENACAO') || descOriginal.toUpperCase().includes('ALIENAÇÃO')) {
      return { grupo: 'nao_operacional', isExplicit: false, motivo: 'Conta de Alienação (Não Operacional)' };
    }

    // ===== RESULTADO FINANCEIRO (apenas headers de bloco — classificação real é feita pelo bloco) =====
    if (desc === 'RESULTADO FINANCEIRO' || desc === 'RESULTADO FINANCEIRO LIQUIDO' ||
        (desc.includes('TOTAL') && desc.includes('FINANCEIRO'))) {
      return { grupo: 'resultado_financeiro', isExplicit: true, motivo: 'Linha explícita de Resultado Financeiro' };
    }

    // ===== PROVISÕES (contas que começam com "PROVISÃO" ou "PROVISAO") — ANTES de Contribuição Social e IRPJ =====
    if (desc.startsWith('PROVISAO') || desc.startsWith('PROVISÃO') ||
        descOriginal.toUpperCase().startsWith('PROVISÃO') || descOriginal.toUpperCase().startsWith('PROVISAO')) {
      return { grupo: 'provisoes', isExplicit: false, motivo: 'Provisão (começa com PROVISÃO)' };
    }

    // ===== CONTAS RESULTADO (contas que começam com "RESULTADO" — prioridade sobre CSLL e IR) =====
    if (desc.startsWith('RESULTADO')) {
      // Exceto as já capturadas acima (RESULTADO FINANCEIRO, RESULTADO BRUTO, RESULTADO OPERACIONAL, RESULTADO LÍQUIDO)
      return { grupo: 'contas_resultado', isExplicit: false, motivo: 'Conta de Resultado (começa com RESULTADO)' };
    }

    // ===== CONTRIBUIÇÃO SOCIAL (não começa com RESULTADO) =====
    if (desc.includes('CONTRIBUICAO SOCIAL') || desc.includes('CSLL')) {
      const isExplicit = desc === 'CONTRIBUICAO SOCIAL' || desc === 'CSLL';
      return { grupo: 'contribuicao_social', isExplicit, motivo: isExplicit ? 'Linha explícita de Contribuição Social' : 'Componente de Contribuição Social' };
    }

    // ===== IR / IRPJ / IMPOSTO DE RENDA (não começa com RESULTADO) =====
    if (desc.includes('IRPJ') || desc.includes('IMPOSTO DE RENDA') || 
        (desc.includes(' IR ') || desc.endsWith(' IR') || desc === 'IR')) {
      return { grupo: 'ir', isExplicit: false, motivo: 'Imposto de Renda (IR/IRPJ)' };
    }

    if (desc.includes('LUCRO LIQUIDO') || desc.includes('RESULTADO LIQUIDO') ||
        desc.includes('LUCRO DO EXERCICIO') || desc.includes('RESULTADO DO EXERCICIO') ||
        desc.includes('LUCRO DO PERIODO')) {
      return { grupo: 'lucro_liquido', isExplicit: true, motivo: 'Linha explícita de Lucro Líquido' };
    }

    // ===== CONTAS QUE COMEÇAM COM "IMPOSTOS" → DESPESAS OPERACIONAIS =====
    if (desc.startsWith('IMPOSTOS')) {
      return { grupo: 'despesas_operacionais', isExplicit: false, motivo: 'Conta de Impostos (Despesa Operacional)' };
    }

    // Deduções são classificadas pelo bloco do parser (entre Receita Operacional e Receita Líquida = DEDUCOES)

    // ===== FALLBACK: Contas não classificadas vão para DESPESAS OPERACIONAIS =====
    return { grupo: 'despesas_operacionais', isExplicit: false, motivo: 'Classificado como Despesa Operacional (fallback)' };
  };

  /**
   * Calculate DRE metrics with classification for debug
   * Includes range-based CMV block detection (ESTOQUE INICIAL → ESTOQUE FINAL)
   */
  const calculateDREMetricsWithClassification = (entries: DREEntry[]): { metrics: CalculatedDRE; classifiedEntries: DREClassifiedEntry[] } => {
    const metrics: CalculatedDRE = {
      receitaBruta: 0,
      receitaBrutaOrigem: 'soma_contas',
      receitaLiquida: 0,
      receitaLiquidaOrigem: 'soma_contas',
      cmv: 0,
      cmvOrigem: 'soma_contas',
      lucroBruto: 0,
      lucroBrutoOrigem: 'soma_contas',
      despesasOperacionais: 0,
      despesasOperacionaisOrigem: 'soma_contas',
      lucroOperacional: 0,
      lucroOperacionalOrigem: 'soma_contas',
      resultadoFinanceiro: 0,
      resultadoFinanceiroOrigem: 'soma_contas',
      contribuicaoSocial: 0,
      contribuicaoSocialOrigem: 'soma_contas',
      lucroLiquido: 0,
      lucroLiquidoOrigem: 'soma_contas',
      margemBruta: 0,
      margemOperacional: 0,
      margemLiquida: 0,
    };

    const classifiedEntries: DREClassifiedEntry[] = [];

    // Flags para linhas explícitas
    let foundReceitaBruta = false;
    let foundReceitaLiquida = false;
    let foundCMV = false;
    let foundLucroBruto = false;
    let foundDespesasOp = false;
    let foundLucroOp = false;
    let foundResultadoFin = false;
    let foundLucroLiq = false;

    // Acumuladores para soma (fallback)
    let somaReceitaBruta = 0;
    let somaCMV = 0;
    let somaDespesasOperacionais = 0;
    let somaResultadoFinanceiro = 0;

    // Map parser grupo to classification grupo
    const mapGrupo = (parserGrupo: string): DREClassifiedEntry['grupo'] => {
      const map: Record<string, DREClassifiedEntry['grupo']> = {
        'RECEITA_BRUTA': 'receita_bruta',
        'RECEITA_LIQUIDA': 'receita_liquida',
        'CMV': 'cmv',
        'LUCRO_BRUTO': 'lucro_bruto',
        'DESPESAS_OPERACIONAIS': 'despesas_operacionais',
        'DEDUCOES': 'despesas_operacionais',
        'LUCRO_OPERACIONAL': 'lucro_operacional',
        'RESULTADO_FINANCEIRO': 'resultado_financeiro',
        'NAO_OPERACIONAL': 'nao_operacional',
        'CONTRIBUICAO_SOCIAL': 'contribuicao_social',
        'LUCRO_LIQUIDO': 'lucro_liquido',
        'CONTAS_RESULTADO': 'contas_resultado',
        'PROVISOES': 'provisoes',
        'IR': 'ir',
      };
      return map[parserGrupo] || 'despesas_operacionais';
    };

    for (const entry of entries) {
      const desc = normalizeText(entry.descricao);
      const valor = entry.valor;
      const valorAbs = Math.abs(valor);

      // Use stored grupo from parser (falls back to classifyDREEntry if no grupo stored)
      let grupo: DREClassifiedEntry['grupo'];
      let motivo: string;
      let isExplicit: boolean;

      if (entry.grupo && entry.grupo !== 'OUTROS') {
        grupo = mapGrupo(entry.grupo);
        isExplicit = false;
        motivo = `Classificado pela IA: ${entry.grupo}`;
      } else {
        const classification = classifyDREEntry(desc, entry.descricao, valor);
        grupo = classification.grupo;
        isExplicit = classification.isExplicit;
        motivo = classification.motivo;
      }

      classifiedEntries.push({
        descricao: entry.descricao,
        valor: entry.valor,
        valorAnterior: entry.valor_anterior,
        grupo,
        isExplicit,
        motivo,
        insideCMVBlock: grupo === 'cmv'
      });

      // Acumular baseado no grupo classificado (para fallback)
      if (grupo === 'despesas_operacionais') {
        somaDespesasOperacionais += valorAbs;
      }
      if (grupo === 'resultado_financeiro') {
        somaResultadoFinanceiro += valor;
      }
      if (grupo === 'cmv') {
        somaCMV += valor;
      }
      if (grupo === 'receita_bruta') {
        somaReceitaBruta += valorAbs;
      }

      // ===== RECEITA BRUTA (linha explícita) =====
      if (desc.includes('RECEITA BRUTA') || desc.includes('RECEITA OPERACIONAL BRUTA')) {
        if (desc === 'RECEITA BRUTA' || desc === 'RECEITA OPERACIONAL BRUTA' || desc.includes('TOTAL')) {
          if (!foundReceitaBruta) {
            metrics.receitaBruta = valorAbs;
            metrics.receitaBrutaOrigem = 'linha_explicita';
            foundReceitaBruta = true;
          }
        }
      }

      // ===== RECEITA LÍQUIDA =====
      if (desc.includes('RECEITA LIQUIDA') || desc.includes('RECEITA OPERACIONAL LIQUIDA')) {
        if (!foundReceitaLiquida) {
          metrics.receitaLiquida = valorAbs;
          metrics.receitaLiquidaOrigem = 'linha_explicita';
          foundReceitaLiquida = true;
        }
      }

      // ===== CMV (linha explícita) =====
      if (desc.includes('CMV') || desc.includes('CPV') || 
          desc.includes('CUSTO DA MERCADORIA') || desc.includes('CUSTO DAS MERCADORIAS') ||
          desc.includes('CUSTO DOS PRODUTOS') || desc.includes('CUSTO DOS SERVICOS')) {
        const isTotal = desc === 'CMV' || desc === 'CPV' || 
                       desc === 'CUSTO DA MERCADORIA VENDIDA' || 
                       desc === 'CUSTO DAS MERCADORIAS VENDIDAS' ||
                       desc === 'CUSTO DOS PRODUTOS VENDIDOS' ||
                       desc === 'CUSTO DOS SERVICOS PRESTADOS' ||
                       desc.includes('TOTAL');
        if (isTotal && !foundCMV) {
          metrics.cmv = valor;
          metrics.cmvOrigem = 'linha_explicita';
          foundCMV = true;
        }
      }

      // ===== LUCRO BRUTO =====
      if (desc === 'LUCRO BRUTO' || desc === 'RESULTADO BRUTO') {
        if (!foundLucroBruto) {
          metrics.lucroBruto = valorAbs;
          metrics.lucroBrutoOrigem = 'linha_explicita';
          foundLucroBruto = true;
        }
      }

      // ===== DESPESAS OPERACIONAIS (linha explícita) =====
      if (desc.includes('DESPESAS OPERACIONAIS') || desc.includes('DESPESAS ADMINISTRATIVAS') ||
          desc.includes('DESPESAS COM VENDAS') || desc.includes('DESPESAS GERAIS') ||
          desc.includes('DESPESAS TRABALHISTAS')) {
        const isTotal = desc === 'DESPESAS OPERACIONAIS' || 
                       desc === 'TOTAL DESPESAS OPERACIONAIS' ||
                       desc === 'TOTAL DAS DESPESAS OPERACIONAIS' ||
                       (desc.includes('TOTAL') && desc.includes('DESPESAS'));
        if (isTotal && !foundDespesasOp) {
          metrics.despesasOperacionais = valorAbs;
          metrics.despesasOperacionaisOrigem = 'linha_explicita';
          foundDespesasOp = true;
        }
      }

      // ===== LUCRO OPERACIONAL =====
      if (desc === 'LUCRO OPERACIONAL' || desc === 'RESULTADO OPERACIONAL' || desc.includes('OPERACIONAL LIQUIDO')) {
        if (!foundLucroOp) {
          metrics.lucroOperacional = valorAbs;
          metrics.lucroOperacionalOrigem = 'linha_explicita';
          foundLucroOp = true;
        }
      }

      // ===== RESULTADO FINANCEIRO (linha explícita total) =====
      if (desc === 'RESULTADO FINANCEIRO' || desc === 'RESULTADO FINANCEIRO LIQUIDO' ||
          (desc.includes('TOTAL') && desc.includes('FINANCEIRO'))) {
        if (!foundResultadoFin) {
          metrics.resultadoFinanceiro = valor;
          metrics.resultadoFinanceiroOrigem = 'linha_explicita';
          foundResultadoFin = true;
        }
      }

      // ===== LUCRO LÍQUIDO =====
      if (desc.includes('LUCRO LIQUIDO') || desc.includes('RESULTADO LIQUIDO') ||
          desc.includes('LUCRO DO EXERCICIO') || desc.includes('RESULTADO DO EXERCICIO') ||
          desc.includes('LUCRO DO PERIODO')) {
        if (!foundLucroLiq) {
          metrics.lucroLiquido = valorAbs;
          metrics.lucroLiquidoOrigem = 'linha_explicita';
          foundLucroLiq = true;
        }
      }
    }

    // ===== FALLBACKS =====
    if (!foundReceitaBruta && somaReceitaBruta > 0) {
      metrics.receitaBruta = somaReceitaBruta;
      metrics.receitaBrutaOrigem = 'soma_contas';
    }

    if (!foundReceitaLiquida && metrics.receitaBruta > 0) {
      metrics.receitaLiquida = metrics.receitaBruta;
      metrics.receitaLiquidaOrigem = metrics.receitaBrutaOrigem;
    }

    if (!foundCMV && somaCMV !== 0) {
      metrics.cmv = somaCMV;
      metrics.cmvOrigem = 'soma_contas';
    }

    if (!foundDespesasOp && somaDespesasOperacionais > 0) {
      metrics.despesasOperacionais = somaDespesasOperacionais;
      metrics.despesasOperacionaisOrigem = 'soma_contas';
    }

    if (!foundResultadoFin && somaResultadoFinanceiro !== 0) {
      metrics.resultadoFinanceiro = somaResultadoFinanceiro;
      metrics.resultadoFinanceiroOrigem = 'soma_contas';
    }

    // Calcular margens
    const receitaBase = metrics.receitaLiquida > 0 ? metrics.receitaLiquida : metrics.receitaBruta;
    metrics.margemBruta = receitaBase > 0 ? (metrics.lucroBruto / receitaBase) * 100 : 0;
    metrics.margemOperacional = receitaBase > 0 ? (metrics.lucroOperacional / receitaBase) * 100 : 0;
    metrics.margemLiquida = receitaBase > 0 ? (metrics.lucroLiquido / receitaBase) * 100 : 0;

    return { metrics, classifiedEntries };
  };

  /**
   * Get color class for DRE group
   */
  const getDREGroupColor = (grupo: DREClassifiedEntry['grupo']): string => {
    const colors: Record<DREClassifiedEntry['grupo'], string> = {
      receita_bruta: 'bg-green-500/20 text-green-400 border-green-500/30',
      receita_liquida: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      cmv: 'bg-red-500/20 text-red-400 border-red-500/30',
      lucro_bruto: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      despesas_operacionais: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      lucro_operacional: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      resultado_financeiro: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      contribuicao_social: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      nao_operacional: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      lucro_liquido: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      contas_resultado: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
      provisoes: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      ir: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    };
    return colors[grupo];
  };

  /**
   * Get label for DRE group
   */
  const getDREGroupLabel = (grupo: DREClassifiedEntry['grupo']): string => {
    const labels: Record<DREClassifiedEntry['grupo'], string> = {
      receita_bruta: 'Receita Bruta',
      receita_liquida: 'Receita Líquida',
      cmv: 'CMV',
      lucro_bruto: 'Lucro Bruto',
      despesas_operacionais: 'Despesas Operacionais',
      lucro_operacional: 'Lucro Operacional',
      resultado_financeiro: 'Resultado Financeiro',
      contribuicao_social: 'Contribuição Social',
      nao_operacional: 'Não Operacional',
      lucro_liquido: 'Lucro Líquido',
      contas_resultado: 'Contas Resultado',
      provisoes: 'Provisões',
      ir: 'Imposto de Renda',
    };
    return labels[grupo];
  };

  /**
   * Calculate Balanço metrics by finding KEY LINES directly
   * 
   * RULES (DO NOT SUM - read directly from specific lines):
   * 1. ATIVO → Ativo Total
   * 2. CIRCULANTE (first one after ATIVO) → Ativo Circulante
   * 3. ATIVO NAO CIRCULANTE or NAO CIRCULANTE (in ATIVO section) → Ativo Não Circulante
   * 4. PASSIVO → Passivo Total
   * 5. CIRCULANTE (first one after PASSIVO) → Passivo Circulante
   * 6. PASSIVO NAO CIRCULANTE or NAO CIRCULANTE (in PASSIVO section) → Passivo Não Circulante
   * 7. PATRIMONIO LIQUIDO → Patrimônio Líquido
   */
  const calculateBalancoMetrics = (entries: BalancoEntry[]): CalculatedBalanco => {
    let ativoTotal = 0;
    let ativoCirculante = 0;
    let ativoNaoCirculante = 0;
    let passivoTotal = 0;
    let passivoCirculante = 0;
    let passivoNaoCirculante = 0;
    let patrimonioLiquido = 0;

    // Track section context
    let inAtivoSection = false;
    let inPassivoSection = false;
    let foundAtivoCirculante = false;
    let foundPassivoCirculante = false;

    for (const entry of entries) {
      const valor = Math.abs(entry.valor);
      const conta = normalizeText(entry.conta);

      // 1. Line "ATIVO" → ATIVO_TOTAL
      if (conta === 'ATIVO') {
        ativoTotal = valor;
        inAtivoSection = true;
        inPassivoSection = false;
        continue;
      }

      // 4. Line "PASSIVO" → PASSIVO_TOTAL
      if (conta === 'PASSIVO') {
        passivoTotal = valor;
        inAtivoSection = false;
        inPassivoSection = true;
        continue;
      }

      // 2. Line "CIRCULANTE" under ATIVO → ATIVO_CIRCULANTE
      // 5. Line "CIRCULANTE" under PASSIVO → PASSIVO_CIRCULANTE
      if (conta === 'CIRCULANTE') {
        if (inAtivoSection && !foundAtivoCirculante) {
          ativoCirculante = valor;
          foundAtivoCirculante = true;
        } else if (inPassivoSection && !foundPassivoCirculante) {
          passivoCirculante = valor;
          foundPassivoCirculante = true;
        }
        continue;
      }

      // 3. Line "ATIVO NAO CIRCULANTE" or "NAO CIRCULANTE" under ATIVO
      if (conta === 'ATIVO NAO CIRCULANTE' || (conta === 'NAO CIRCULANTE' && inAtivoSection)) {
        ativoNaoCirculante = valor;
        continue;
      }

      // 6. Line "PASSIVO NAO CIRCULANTE" or "NAO CIRCULANTE" under PASSIVO
      if (conta === 'PASSIVO NAO CIRCULANTE' || (conta === 'NAO CIRCULANTE' && inPassivoSection)) {
        passivoNaoCirculante = valor;
        continue;
      }

      // 7. Line "PATRIMONIO LIQUIDO"
      if (conta === 'PATRIMONIO LIQUIDO') {
        patrimonioLiquido = valor;
        continue;
      }
    }

    return {
      ativoCirculante,
      ativoNaoCirculante,
      ativoTotal,
      passivoCirculante,
      passivoNaoCirculante,
      passivoTotal,
      patrimonioLiquido
    };
  };

  /**
   * Generate diagnostic lines for debugging import issues
   */
  const generateDiagnosticLines = (entries: BalancoEntry[]): DiagnosticLine[] => {
    const keyAccounts = ['ATIVO', 'CIRCULANTE', 'NAO CIRCULANTE', 'ATIVO NAO CIRCULANTE', 'PASSIVO', 'PASSIVO NAO CIRCULANTE', 'PATRIMONIO LIQUIDO'];
    const diagnostics: DiagnosticLine[] = [];

    // Track section context
    let currentSection: 'ATIVO' | 'PASSIVO' | 'PL' = 'ATIVO';
    let foundAtivoCirculante = false;
    let foundPassivoCirculante = false;

    for (const entry of entries) {
      const contaNorm = normalizeText(entry.conta);
      
      let secao: 'ATIVO' | 'PASSIVO' | 'PL' | '-' = currentSection;
      let motivo = '';
      let tipoClassificado = entry.tipo;

      if (contaNorm === 'ATIVO') {
        currentSection = 'ATIVO';
        secao = 'ATIVO';
        foundAtivoCirculante = false;
        motivo = 'Início da seção ATIVO';
      } else if (contaNorm === 'PASSIVO') {
        currentSection = 'PASSIVO';
        secao = 'PASSIVO';
        foundPassivoCirculante = false;
        motivo = 'Início da seção PASSIVO';
      } else if (contaNorm.includes('PATRIMONIO LIQUIDO')) {
        currentSection = 'PL';
        secao = 'PL';
        motivo = 'Patrimônio Líquido detectado';
      } else if (contaNorm === 'CIRCULANTE' || contaNorm.startsWith('CIRCULANTE')) {
        secao = currentSection;
        if (currentSection === 'ATIVO' && !foundAtivoCirculante) {
          foundAtivoCirculante = true;
          motivo = `PRIMEIRO "CIRCULANTE" na seção ATIVO → ATIVO_CIRCULANTE`;
        } else if (currentSection === 'PASSIVO' && !foundPassivoCirculante) {
          foundPassivoCirculante = true;
          motivo = `PRIMEIRO "CIRCULANTE" na seção PASSIVO → PASSIVO_CIRCULANTE`;
        } else {
          motivo = `"CIRCULANTE" adicional - subconta de ${tipoClassificado}`;
        }
      } else if (contaNorm === 'ATIVO CIRCULANTE') {
        secao = 'ATIVO';
        foundAtivoCirculante = true;
        motivo = '"ATIVO CIRCULANTE" explícito';
      } else if (contaNorm === 'PASSIVO CIRCULANTE') {
        secao = 'PASSIVO';
        foundPassivoCirculante = true;
        motivo = '"PASSIVO CIRCULANTE" explícito';
      } else if (contaNorm.includes('NAO CIRCULANTE')) {
        secao = currentSection;
        motivo = currentSection === 'ATIVO' 
          ? '"NÃO CIRCULANTE" na seção ATIVO → ATIVO_NAO_CIRCULANTE'
          : '"NÃO CIRCULANTE" na seção PASSIVO → PASSIVO_NAO_CIRCULANTE';
      } else {
        secao = currentSection;
        motivo = `Herda tipo da seção atual (${currentSection})`;
      }

      const isKeyAccount = keyAccounts.some(k => contaNorm === k || contaNorm.includes(k));
      
      if (isKeyAccount) {
        const hasValor = entry.valor !== 0;
        const hasValorAnterior = entry.valor_anterior !== null && entry.valor_anterior !== 0;
        
        diagnostics.push({
          conta: entry.conta,
          valor: entry.valor,
          valorAnterior: entry.valor_anterior,
          colunaUsada: hasValor ? 'atual' : (hasValorAnterior ? 'anterior' : 'nenhuma'),
          encontrado: hasValor || hasValorAnterior,
          secao,
          tipoClassificado,
          motivo
        });
      }
    }

    return diagnostics;
  };

  const generateInsights = (dre: CalculatedDRE, balanco: CalculatedBalanco): string[] => {
    const insights: string[] = [];

    if (dre.margemLiquida > 20) {
      insights.push("✅ Margem líquida excelente, acima de 20%. A empresa demonstra alta eficiência na conversão de receitas em lucro.");
    } else if (dre.margemLiquida > 10) {
      insights.push("👍 Margem líquida saudável entre 10-20%. Há espaço para otimização de custos.");
    } else if (dre.margemLiquida > 0) {
      insights.push("⚠️ Margem líquida abaixo de 10%. Recomenda-se revisão de custos operacionais e estratégia de preços.");
    } else {
      insights.push("🚨 Empresa operando com prejuízo. Necessária reestruturação urgente de custos.");
    }

    if (dre.receitaLiquida > 10000000) {
      insights.push("📈 Receita líquida acima de R$ 10 milhões indica operação de grande porte.");
    } else if (dre.receitaLiquida > 1000000) {
      insights.push("📊 Receita líquida na faixa de R$ 1-10 milhões, característica de empresa de médio porte.");
    }

    if (balanco.ativoTotal > 0 && balanco.passivoCirculante > 0) {
      const liquidezGeral = balanco.ativoCirculante / balanco.passivoCirculante;
      if (liquidezGeral > 2) {
        insights.push("💰 Liquidez corrente excelente. A empresa tem folga financeira para honrar compromissos de curto prazo.");
      } else if (liquidezGeral > 1) {
        insights.push("💵 Liquidez corrente adequada. Ativo circulante cobre as obrigações de curto prazo.");
      } else {
        insights.push("⚠️ Liquidez corrente preocupante. Pode haver dificuldades no pagamento de obrigações de curto prazo.");
      }
    }

    if (balanco.patrimonioLiquido > 0 && balanco.ativoTotal > 0) {
      const proporcaoPL = (balanco.patrimonioLiquido / balanco.ativoTotal) * 100;
      if (proporcaoPL > 50) {
        insights.push("🏦 Estrutura de capital sólida com baixa dependência de terceiros.");
      } else if (proporcaoPL > 30) {
        insights.push("📋 Estrutura de capital equilibrada entre capital próprio e de terceiros.");
      } else {
        insights.push("⚡ Alta alavancagem financeira. Empresa depende significativamente de capital de terceiros.");
      }
    }

    return insights;
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  // Prepare entries for manual edit dialog
  const prepareEditableBalancoEntries = useCallback((): EditableBalancoEntry[] => {
    return rawBalancoEntries.map((entry, index) => ({
      id: `balanco-${index}`,
      conta: entry.conta,
      tipo: entry.tipo,
      valor: entry.valor,
      originalTipo: entry.tipo,
      originalValor: entry.valor,
      isModified: false,
    }));
  }, [rawBalancoEntries]);

  const prepareEditableDREEntries = useCallback((): EditableDREEntry[] => {
    return dreClassifiedEntries.map((entry, index) => ({
      id: `dre-${index}`,
      descricao: entry.descricao,
      grupo: entry.grupo,
      valor: entry.valor,
      originalGrupo: entry.grupo,
      originalValor: entry.valor,
      isModified: false,
    }));
  }, [dreClassifiedEntries]);

  // Handle manual edit apply
  const handleApplyManualChanges = useCallback(
    (editedBalanco: EditableBalancoEntry[], editedDRE: EditableDREEntry[]) => {
      setIsApplyingChanges(true);

      try {
        // Update raw balanço entries with changes
        const updatedBalanco: BalancoEntry[] = rawBalancoEntries.map((entry, index) => {
          const edited = editedBalanco.find((e) => e.id === `balanco-${index}`);
          if (edited && edited.isModified) {
            return {
              ...entry,
              tipo: edited.tipo,
              valor: edited.valor,
            };
          }
          return entry;
        });

        // Recalculate balanço metrics
        const newBalancoMetrics = calculateBalancoMetrics(updatedBalanco);
        setBalancoData(newBalancoMetrics);
        setRawBalancoEntries(updatedBalanco);

        // Generate new diagnostic lines
        const newDiagnostics = generateDiagnosticLines(updatedBalanco);
        setDiagnosticLines(newDiagnostics);

        // Update DRE entries with changes - create modified DREEntry array
        const updatedDREEntries: DREEntry[] = rawDreEntries.map((entry, index) => {
          const edited = editedDRE.find((e) => e.id === `dre-${index}`);
          if (edited && edited.isModified) {
            return {
              ...entry,
              valor: edited.valor,
            };
          }
          return entry;
        });

        // Create classified entries with updated groups
        const updatedClassified: DREClassifiedEntry[] = dreClassifiedEntries.map((entry, index) => {
          const edited = editedDRE.find((e) => e.id === `dre-${index}`);
          if (edited && edited.isModified) {
            return {
              ...entry,
              grupo: edited.grupo as DREClassifiedEntry['grupo'],
              valor: edited.valor,
              motivo: 'Modificado manualmente pelo usuário',
            };
          }
          return entry;
        });

        // Recalculate DRE metrics from modified classified entries
        const newDREMetrics = recalculateDREMetricsFromClassified(updatedClassified);
        setDreData(newDREMetrics);
        setDreClassifiedEntries(updatedClassified);
        setRawDreEntries(updatedDREEntries);

        // Regenerate insights
        setInsights(generateInsights(newDREMetrics, newBalancoMetrics));

        // Close dialog
        setShowManualEdit(false);
      } catch (error) {
        console.error("Error applying manual changes:", error);
      } finally {
        setIsApplyingChanges(false);
      }
    },
    [rawBalancoEntries, rawDreEntries, dreClassifiedEntries]
  );

  // Recalculate DRE metrics from classified entries (used after manual edit)
  const recalculateDREMetricsFromClassified = (entries: DREClassifiedEntry[]): CalculatedDRE => {
    const metrics: CalculatedDRE = {
      receitaBruta: 0,
      receitaBrutaOrigem: 'soma_contas',
      receitaLiquida: 0,
      receitaLiquidaOrigem: 'soma_contas',
      cmv: 0,
      cmvOrigem: 'soma_contas',
      lucroBruto: 0,
      lucroBrutoOrigem: 'soma_contas',
      despesasOperacionais: 0,
      despesasOperacionaisOrigem: 'soma_contas',
      lucroOperacional: 0,
      lucroOperacionalOrigem: 'soma_contas',
      resultadoFinanceiro: 0,
      resultadoFinanceiroOrigem: 'soma_contas',
      contribuicaoSocial: 0,
      contribuicaoSocialOrigem: 'soma_contas',
      lucroLiquido: 0,
      lucroLiquidoOrigem: 'soma_contas',
      margemBruta: 0,
      margemOperacional: 0,
      margemLiquida: 0,
    };

    // Find explicit lines first, then sum components
    for (const entry of entries) {
      const valorAbs = Math.abs(entry.valor);
      
      switch (entry.grupo) {
        case 'receita_bruta':
          if (entry.isExplicit && metrics.receitaBruta === 0) {
            metrics.receitaBruta = valorAbs;
            metrics.receitaBrutaOrigem = 'linha_explicita';
          } else if (!entry.isExplicit) {
            if (metrics.receitaBrutaOrigem !== 'linha_explicita') {
              metrics.receitaBruta += valorAbs;
            }
          }
          break;
        case 'receita_liquida':
          if (metrics.receitaLiquida === 0) {
            metrics.receitaLiquida = valorAbs;
            metrics.receitaLiquidaOrigem = 'linha_explicita';
          }
          break;
        case 'cmv':
          if (entry.isExplicit && metrics.cmv === 0) {
            metrics.cmv = entry.valor; // Keep sign
            metrics.cmvOrigem = 'linha_explicita';
          } else if (!entry.isExplicit) {
            if (metrics.cmvOrigem !== 'linha_explicita') {
              metrics.cmv += entry.valor;
            }
          }
          break;
        case 'lucro_bruto':
          if (metrics.lucroBruto === 0) {
            metrics.lucroBruto = valorAbs;
            metrics.lucroBrutoOrigem = 'linha_explicita';
          }
          break;
        case 'despesas_operacionais':
          if (entry.isExplicit && metrics.despesasOperacionais === 0) {
            metrics.despesasOperacionais = valorAbs;
            metrics.despesasOperacionaisOrigem = 'linha_explicita';
          } else if (!entry.isExplicit) {
            if (metrics.despesasOperacionaisOrigem !== 'linha_explicita') {
              metrics.despesasOperacionais += valorAbs;
            }
          }
          break;
        case 'lucro_operacional':
          if (metrics.lucroOperacional === 0) {
            metrics.lucroOperacional = valorAbs;
            metrics.lucroOperacionalOrigem = 'linha_explicita';
          }
          break;
        case 'resultado_financeiro':
          if (entry.isExplicit && metrics.resultadoFinanceiro === 0) {
            metrics.resultadoFinanceiro = entry.valor;
            metrics.resultadoFinanceiroOrigem = 'linha_explicita';
          } else if (!entry.isExplicit) {
            if (metrics.resultadoFinanceiroOrigem !== 'linha_explicita') {
              metrics.resultadoFinanceiro += entry.valor;
            }
          }
          break;
        case 'lucro_liquido':
          if (metrics.lucroLiquido === 0) {
            metrics.lucroLiquido = valorAbs;
            metrics.lucroLiquidoOrigem = 'linha_explicita';
          }
          break;
      }
    }

    // Fallbacks
    if (metrics.receitaLiquida === 0 && metrics.receitaBruta > 0) {
      metrics.receitaLiquida = metrics.receitaBruta;
      metrics.receitaLiquidaOrigem = metrics.receitaBrutaOrigem;
    }

    // Calculate margins
    const receitaBase = metrics.receitaLiquida > 0 ? metrics.receitaLiquida : metrics.receitaBruta;
    metrics.margemBruta = receitaBase > 0 ? (metrics.lucroBruto / receitaBase) * 100 : 0;
    metrics.margemOperacional = receitaBase > 0 ? (metrics.lucroOperacional / receitaBase) * 100 : 0;
    metrics.margemLiquida = receitaBase > 0 ? (metrics.lucroLiquido / receitaBase) * 100 : 0;

    return metrics;
  };

  const handleExportPDF = async () => {
    if (!dreData || !balancoData) {
      console.error('No data available for PDF export');
      return;
    }
    
    setIsExporting(true);
    console.log('Starting PDF export...');
    
    const currentDate = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Create PDF wrapper with custom styling
    const pdfWrapper = document.createElement('div');
    pdfWrapper.innerHTML = `
      <style>
        * {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          box-sizing: border-box;
        }
        .pdf-container {
          padding: 40px;
          background: #ffffff;
          color: #1a1a2e;
        }
        .pdf-header {
          text-align: center;
          margin-bottom: 40px;
          padding-bottom: 30px;
          border-bottom: 3px solid #3b82f6;
        }
        .pdf-logo {
          font-size: 32px;
          font-weight: bold;
          color: #3b82f6;
          margin-bottom: 8px;
        }
        .pdf-title {
          font-size: 24px;
          color: #374151;
          margin-bottom: 8px;
        }
        .pdf-date {
          font-size: 14px;
          color: #6b7280;
        }
        .pdf-section {
          margin-bottom: 35px;
          page-break-inside: avoid;
        }
        .pdf-section-title {
          font-size: 18px;
          font-weight: bold;
          color: #1e40af;
          margin-bottom: 20px;
          padding-bottom: 8px;
          border-bottom: 2px solid #e5e7eb;
        }
        .pdf-metrics-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
          margin-bottom: 20px;
        }
        .pdf-metric-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
        }
        .pdf-metric-label {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .pdf-metric-value {
          font-size: 18px;
          font-weight: bold;
          color: #1e293b;
        }
        .pdf-metric-highlight {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: white;
        }
        .pdf-metric-highlight .pdf-metric-label {
          color: rgba(255,255,255,0.8);
        }
        .pdf-metric-highlight .pdf-metric-value {
          color: white;
        }
        .pdf-margins-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
        }
        .pdf-margins-table th,
        .pdf-margins-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        .pdf-margins-table th {
          background: #f1f5f9;
          font-weight: 600;
          color: #475569;
          font-size: 13px;
        }
        .pdf-margins-table td {
          font-size: 14px;
          color: #374151;
        }
        .pdf-progress-bar {
          background: #e5e7eb;
          border-radius: 4px;
          height: 8px;
          overflow: hidden;
        }
        .pdf-progress-fill {
          height: 100%;
          border-radius: 4px;
        }
        .pdf-progress-blue { background: #3b82f6; }
        .pdf-progress-green { background: #10b981; }
        .pdf-progress-purple { background: #8b5cf6; }
        .pdf-insight {
          background: #f0fdf4;
          border-left: 4px solid #22c55e;
          padding: 12px 16px;
          margin-bottom: 10px;
          font-size: 14px;
          color: #166534;
          border-radius: 0 6px 6px 0;
        }
        .pdf-footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 2px solid #e5e7eb;
          text-align: center;
          font-size: 12px;
          color: #9ca3af;
        }
        .pdf-footer-brand {
          font-weight: 600;
          color: #3b82f6;
        }
      </style>
      <div class="pdf-container">
        <div class="pdf-header">
          <div class="pdf-logo">📊 ProCont</div>
          <div class="pdf-title">Relatório de Resultados Financeiros</div>
          <div class="pdf-date">Gerado em: ${currentDate}</div>
        </div>

        <div class="pdf-section">
          <div class="pdf-section-title">📈 Demonstração do Resultado (DRE)</div>
          <div class="pdf-metrics-grid">
            <div class="pdf-metric-card pdf-metric-highlight">
              <div class="pdf-metric-label">Receita Bruta</div>
              <div class="pdf-metric-value">${dreData?.receitaBruta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Receita Líquida</div>
              <div class="pdf-metric-value">${dreData?.receitaLiquida.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">CMV / Custos</div>
              <div class="pdf-metric-value">${dreData?.cmv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Lucro Bruto</div>
              <div class="pdf-metric-value">${dreData?.lucroBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Despesas Operacionais</div>
              <div class="pdf-metric-value">${dreData?.despesasOperacionais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Lucro Operacional</div>
              <div class="pdf-metric-value">${dreData?.lucroOperacional.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Resultado Financeiro</div>
              <div class="pdf-metric-value">${dreData?.resultadoFinanceiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card pdf-metric-highlight">
              <div class="pdf-metric-label">Lucro Líquido</div>
              <div class="pdf-metric-value">${dreData?.lucroLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
          </div>
          
          <table class="pdf-margins-table">
            <thead>
              <tr>
                <th>Indicador</th>
                <th>Valor</th>
                <th>Análise</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Margem Bruta</td>
                <td><strong>${dreData?.margemBruta.toFixed(2)}%</strong></td>
                <td>
                  <div class="pdf-progress-bar">
                    <div class="pdf-progress-fill pdf-progress-purple" style="width: ${Math.min(dreData?.margemBruta || 0, 100)}%"></div>
                  </div>
                </td>
              </tr>
              <tr>
                <td>Margem Operacional</td>
                <td><strong>${dreData?.margemOperacional.toFixed(2)}%</strong></td>
                <td>
                  <div class="pdf-progress-bar">
                    <div class="pdf-progress-fill pdf-progress-blue" style="width: ${Math.min(dreData?.margemOperacional || 0, 100)}%"></div>
                  </div>
                </td>
              </tr>
              <tr>
                <td>Margem Líquida</td>
                <td><strong>${dreData?.margemLiquida.toFixed(2)}%</strong></td>
                <td>
                  <div class="pdf-progress-bar">
                    <div class="pdf-progress-fill pdf-progress-green" style="width: ${Math.min(dreData?.margemLiquida || 0, 100)}%"></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pdf-section">
          <div class="pdf-section-title">⚖️ Balanço Patrimonial</div>
          <div class="pdf-metrics-grid">
            <div class="pdf-metric-card pdf-metric-highlight">
              <div class="pdf-metric-label">Ativo Total</div>
              <div class="pdf-metric-value">${balancoData?.ativoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Passivo Total</div>
              <div class="pdf-metric-value">${balancoData?.passivoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Patrimônio Líquido</div>
              <div class="pdf-metric-value">${balancoData?.patrimonioLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
          </div>

          <table class="pdf-margins-table">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Valor</th>
                <th>% do Ativo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Ativo Circulante</td>
                <td>${balancoData?.ativoCirculante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${balancoData?.ativoTotal ? ((balancoData.ativoCirculante / balancoData.ativoTotal) * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td>Ativo Não Circulante</td>
                <td>${balancoData?.ativoNaoCirculante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${balancoData?.ativoTotal ? ((balancoData.ativoNaoCirculante / balancoData.ativoTotal) * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td>Passivo Circulante</td>
                <td>${balancoData?.passivoCirculante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${balancoData?.ativoTotal ? ((balancoData.passivoCirculante / balancoData.ativoTotal) * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td>Passivo Não Circulante</td>
                <td>${balancoData?.passivoNaoCirculante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${balancoData?.ativoTotal ? ((balancoData.passivoNaoCirculante / balancoData.ativoTotal) * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td><strong>Patrimônio Líquido</strong></td>
                <td><strong>${balancoData?.patrimonioLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
                <td><strong>${balancoData?.ativoTotal ? ((balancoData.patrimonioLiquido / balancoData.ativoTotal) * 100).toFixed(1) : 0}%</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pdf-section">
          <div class="pdf-section-title">💡 Insights e Recomendações</div>
          ${insights.map(insight => `<div class="pdf-insight">${insight}</div>`).join('')}
        </div>

        <div class="pdf-footer">
          <div class="pdf-footer-brand">Gerado por ProCont</div>
          <div>Sistema de Análise Financeira Contábil</div>
        </div>
      </div>
    `;

    const opt = {
      margin: 10,
      filename: `relatorio-procont-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      console.log('Generating PDF with html2pdf...');
      await html2pdf().from(pdfWrapper).set(opt).save();
      console.log('PDF generated successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando análise...</p>
        </div>
      </div>
    );
  }

  if (!dreData || !balancoData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Nenhum dado encontrado.</p>
          <Link to="/upload">
            <Button variant="hero">Fazer Upload</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background effects */}
      <div className="hero-glow w-full h-[400px] top-0 left-0" />

      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-6 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link to="/upload">
            <Button variant="ghost" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Nova Análise
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
          <Link to="/">
            <Button variant="glass" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Início
            </Button>
          </Link>
        </div>
      </nav>

      <main className="relative z-10 container mx-auto px-6 py-12">
        {/* Header */}
        <div className="max-w-4xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
            <span className="text-sm text-green-400 font-medium">
              ✓ Análise Concluída
            </span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Resultado da <span className="gradient-text">Análise Financeira</span>
          </h1>
          <p className="text-muted-foreground">
            Dados extraídos e processados dos seus arquivos de DRE e Balanço Patrimonial.
          </p>
        </div>

        {/* ===== DASHBOARD DE INDICADORES ===== */}
        <DashboardIndicadores
          dreData={dreData}
          balancoData={balancoData}
          dreClassifiedEntries={dreClassifiedEntries}
          rawBalancoEntries={rawBalancoEntries}
          getDREGroupColor={getDREGroupColor}
          getDREGroupLabel={getDREGroupLabel}
          showDreDebug={showDreDebug}
          setShowDreDebug={setShowDreDebug}
        />


        {/* ===== DASHBOARD BALANCETE ===== */}
        {balanceteEntries.length > 0 && (
          <DashboardBalancete entries={balanceteEntries} />
        )}

        {/* Diagnóstico de Importação Section */}
        {diagnosticLines.length > 0 && (
          <section className="mb-12">
            <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
              🔍 Diagnóstico de Importação
            </h2>
            <div className="glass-card p-6">
              <p className="text-sm text-muted-foreground mb-4">
                Linhas de totais encontradas no arquivo e valores importados:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Conta</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Seção</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Tipo</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Valor</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticLines.map((line, index) => (
                      <tr key={index} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium text-foreground">{line.conta}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            line.secao === 'ATIVO' 
                              ? 'bg-blue-500/20 text-blue-400' 
                              : line.secao === 'PASSIVO'
                                ? 'bg-orange-500/20 text-orange-400'
                                : line.secao === 'PL'
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-muted text-muted-foreground'
                          }`}>
                            {line.secao}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-foreground text-xs">{line.tipoClassificado}</td>
                        <td className="py-2 px-3 text-right text-foreground">
                          {line.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {line.encontrado 
                            ? <span className="text-green-400">✓</span>
                            : <span className="text-red-400">✗</span>
                          }
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs max-w-xs truncate" title={line.motivo}>
                          {line.motivo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* XLS Validation Mode */}
        {validationRows.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-bold flex items-center gap-3">
                <FileSearch className="w-6 h-6 text-primary" />
                Validação XLS
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowValidation(!showValidation)}
              >
                <FileSearch className="w-4 h-4 mr-2" />
                {showValidation ? "Ocultar" : "Ver"} Validação ({validationRows.length} linhas)
              </Button>
            </div>
            {showValidation && (
              <XLSValidationMode
                rows={validationRows}
                filename={validationFilename}
                onClose={() => setShowValidation(false)}
              />
            )}
          </section>
        )}

        {/* AI Section - Analysis and Presentation */}
        <section className="mb-12">
          <div className="grid md:grid-cols-2 gap-6">
            {/* AI Analysis Card */}
            <div className="glass-card p-8 text-center bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-display text-xl font-bold mb-3">
                🤖 Análise Inteligente
              </h3>
              <p className="text-muted-foreground mb-6 text-sm">
                Gere uma análise detalhada com insights estratégicos, 
                pontos de atenção e recomendações personalizadas.
              </p>
              <Button 
                variant="hero" 
                size="lg" 
                onClick={() => setShowAIAnalysis(true)}
              >
                <Sparkles className="w-5 h-5 mr-2" />
                Gerar Análise
              </Button>
            </div>

            {/* AI Presentation Card */}
            <div className="glass-card p-8 text-center bg-gradient-to-br from-secondary/5 to-secondary/10 border-secondary/20">
              <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto mb-4">
                <Presentation className="w-8 h-8 text-secondary" />
              </div>
              <h3 className="font-display text-xl font-bold mb-3">
                📊 Apresentação Executiva
              </h3>
              <p className="text-muted-foreground mb-6 text-sm">
                Crie slides profissionais com a situação financeira da empresa,
                indicadores chave e recomendações estratégicas.
              </p>
              <Button 
                variant="neon" 
                size="lg" 
                onClick={() => setShowAIPresentation(true)}
              >
                <Presentation className="w-5 h-5 mr-2" />
                Gerar Apresentação
              </Button>
            </div>
          </div>
        </section>

        {/* Insights Section */}
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold mb-6">
            💡 Insights Automáticos
          </h2>
          <div className="glass-card p-6 space-y-4">
            {insights.map((insight, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border/50"
              >
                <p className="text-foreground">{insight}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Financial Chat Section */}
        {dreData && balancoData && (
          <section className="mb-12">
            <h2 className="font-display text-2xl font-bold mb-6">
              🤖 Simulador de Cenários
            </h2>
            <FinancialChatBox
              financialContext={{
                dre: dreData,
                balanco: balancoData,
                dreEntries: dreClassifiedEntries.map(e => ({
                  descricao: e.descricao,
                  valor: e.valor,
                  grupo: e.grupo,
                })),
                balancoEntries: rawBalancoEntries.map(e => ({
                  conta: e.conta,
                  valor: e.valor,
                  tipo: e.tipo,
                  hierarchy: e.hierarchy || '',
                })),
                empresa: selectedEmpresa ? {
                  nome: selectedEmpresa.nome,
                  cnpj: selectedEmpresa.cnpj,
                  cnae: selectedEmpresa.cnae,
                  regime_tributario: selectedEmpresa.regime_tributario,
                  contexto: selectedEmpresa.contexto,
                } : undefined,
              }}
            />
          </section>
        )}

        {/* Export PDF Button */}
        <section className="mb-12">
          <div className="glass-card p-8 text-center">
            <h3 className="font-display text-xl font-bold mb-3">
              📄 Exportar Relatório
            </h3>
            <p className="text-muted-foreground mb-6">
              Gere um PDF profissional com todos os dados desta análise para enviar aos seus clientes.
            </p>
            <Button 
              variant="hero" 
              size="xl" 
              onClick={handleExportPDF}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <FileDown className="w-5 h-5 mr-2" />
                  Exportar relatório em PDF
                </>
              )}
            </Button>
          </div>
        </section>

        {/* Manual Edit Section */}
        <section className="mb-12">
          <div className="glass-card p-8 text-center border-2 border-dashed border-primary/30">
            <h3 className="font-display text-xl font-bold mb-3 flex items-center justify-center gap-2">
              <Edit3 className="w-5 h-5 text-primary" />
              Correções Manuais
            </h3>
            <p className="text-muted-foreground mb-6">
              Precisa corrigir alguma classificação ou valor? Edite manualmente as contas e recalcule os resultados.
            </p>
            <Button 
              variant="outline" 
              size="xl" 
              onClick={() => setShowManualEdit(true)}
              className="border-primary/50 hover:bg-primary/10"
            >
              <Edit3 className="w-5 h-5 mr-2" />
              Modificações Manuais
            </Button>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            Deseja analisar outro cliente?
          </p>
          <Link to="/upload">
            <Button variant="hero" size="xl">
              <RefreshCw className="w-5 h-5 mr-2" />
              Nova Análise
            </Button>
          </Link>
        </div>
      </main>

      {/* Manual Edit Dialog */}
      <ManualEditDialog
        open={showManualEdit}
        onOpenChange={setShowManualEdit}
        balancoEntries={prepareEditableBalancoEntries()}
        dreEntries={prepareEditableDREEntries()}
        onApplyChanges={handleApplyManualChanges}
        isApplying={isApplyingChanges}
      />

      {/* AI Analysis Dialog */}
      <AIAnalysisDialog
        open={showAIAnalysis}
        onOpenChange={setShowAIAnalysis}
        dreData={dreData}
        balancoData={balancoData}
      />

      {/* AI Presentation Dialog */}
      <AIPresentationDialog
        open={showAIPresentation}
        onOpenChange={setShowAIPresentation}
        dreData={dreData}
        balancoData={balancoData}
        empresaNome="Empresa"
      />
    </div>
  );
};

export default Resultado;
