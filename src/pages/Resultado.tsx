import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AddFilesDialog } from "@/components/AddFilesDialog";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { ProgressBar } from "@/components/ProgressBar";
import { XLSValidationMode, ValidationRow } from "@/components/XLSValidationMode";
import { ManualEditDialog, EditableBalancoEntry, EditableDREEntry } from "@/components/ManualEditDialog";
import { AIAnalysisDialog } from "@/components/AIAnalysisDialog";
import { AIPresentationDialog } from "@/components/AIPresentationDialog";
import { FinancialChatBox } from "@/components/FinancialChatBox";
import { DashboardIndicadores } from "@/components/DashboardIndicadores";
import { DashboardBalancete, type BalanceteClassifiedEntry } from "@/components/DashboardBalancete";
import { BalanceteHistoricoModal, type PreviousPeriodBalancete } from "@/components/BalanceteHistoricoModal";
import { BalanceteComparativo } from "@/components/BalanceteComparativo";
import { FaturamentoAnalysis, type FaturamentoRow } from "@/components/FaturamentoAnalysis";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { detectSyntheticEntries, validateAgainstSyntheticTotals } from "@/lib/syntheticDetector";
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
  CalendarDays,
  UploadCloud,
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
  natureza_conta?: "sintetica" | "analitica";
  detection_motivo?: string;
  is_redutora?: boolean;
  natureza?: string | null;
}

interface DiagnosticLine {
  conta: string;
  valor: number;
  valorAnterior: number | null;
  colunaUsada: "atual" | "anterior" | "nenhuma";
  encontrado: boolean;
  secao: "ATIVO" | "PASSIVO" | "PL" | "-";
  tipoClassificado: string;
  motivo: string;
}

interface CalculatedDRE {
  receitaBruta: number;
  receitaBrutaOrigem: "linha_explicita" | "soma_contas";
  receitaLiquida: number;
  receitaLiquidaOrigem: "linha_explicita" | "soma_contas";
  cmv: number;
  cmvOrigem: "linha_explicita" | "soma_contas";
  lucroBruto: number;
  lucroBrutoOrigem: "linha_explicita" | "soma_contas";
  despesasOperacionais: number;
  despesasOperacionaisOrigem: "linha_explicita" | "soma_contas";
  lucroOperacional: number;
  lucroOperacionalOrigem: "linha_explicita" | "soma_contas";
  resultadoFinanceiro: number;
  resultadoFinanceiroOrigem: "linha_explicita" | "soma_contas";
  contribuicaoSocial: number;
  contribuicaoSocialOrigem: "linha_explicita" | "soma_contas";
  lucroLiquido: number;
  lucroLiquidoOrigem: "linha_explicita" | "soma_contas";
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Types for DRE classification debug
interface DREClassifiedEntry {
  descricao: string;
  valor: number;
  valorAnterior: number | null;
  grupo:
    | "receita_bruta"
    | "receita_liquida"
    | "cmv"
    | "lucro_bruto"
    | "despesas_operacionais"
    | "lucro_operacional"
    | "resultado_financeiro"
    | "nao_operacional"
    | "contribuicao_social"
    | "ir"
    | "lucro_liquido"
    | "contas_resultado"
    | "provisoes";
  isExplicit: boolean;
  motivo: string;
  insideCMVBlock?: boolean;
}

/**
 * Infer indent level from raw_row data or account name when DB entry doesn't have indent_level stored.
 */
function inferIndentFromRawRow(entry: any): number {
  // If indent_level is already set (from parser), use it
  if (typeof entry.indent_level === "number") return entry.indent_level;

  // Try to find first non-empty text cell position from raw_row
  if (entry.raw_row && Array.isArray(entry.raw_row)) {
    for (let i = 0; i < entry.raw_row.length; i++) {
      const cell = String(entry.raw_row[i] || "").trim();
      if (cell.length >= 2 && /[a-zA-ZÀ-ú]/.test(cell)) {
        return i;
      }
    }
  }

  // Fallback: infer from account name (top-level groups = 0)
  const norm = normalizeText(entry.conta || "");
  const topLevelNames = ["ATIVO", "PASSIVO", "CIRCULANTE", "NAO CIRCULANTE", "PATRIMONIO LIQUIDO"];
  if (topLevelNames.some((n) => norm === n)) return 0;
  return 1;
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
  const [balancetePeriodo, setBalancetePeriodo] = useState<string>("");
  const [previousPeriods, setPreviousPeriods] = useState<PreviousPeriodBalancete[]>([]);
  const [showHistoricoModal, setShowHistoricoModal] = useState(false);

  // Faturamento state
  const [faturamentoData, setFaturamentoData] = useState<FaturamentoRow[]>([]);

  // Add Files modal state
  const [showAddFiles, setShowAddFiles] = useState(false);

  // Empresa context
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaData | null>(null);
  const [pdfAiData, setPdfAiData] = useState<{
    resumo?: any;
    analiseRentabilidade?: any;
    analisePatrimonial?: any;
    // legacy fallback keys
    rentabilidade?: any;
    liquidez?: any;
    estrutura?: any;
    pontosFortes?: any;
    pontosAtencao?: any;
    recomendacoes?: any;
    conclusao?: any;
  } | null>(null);
  const [isFetchingPdfAi, setIsFetchingPdfAi] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const empresaIdParam = searchParams.get("empresa_id");
  const { user, signOut } = useAuth();
  const { branding } = useBranding();

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
      // Helper de paginação que busca TODOS os registros em lotes de 1000
      async function fetchAllRows(query: any): Promise<any[]> {
        const PAGE_SIZE = 1000;
        let allRows: any[] = [];
        let from = 0;

        while (true) {
          const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allRows = allRows.concat(data);
          if (data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }

        return allRows;
      }

      // Build query filters
      let dreBaseQuery = supabase.from("dre_entries").select("*").eq("user_id", user.id);
      let balancoBaseQuery = supabase.from("balanco_entries").select("*").eq("user_id", user.id);
      let balanceteBaseQuery = supabase.from("balancete_entries").select("*").eq("user_id", user.id);
      let faturamentoBaseQuery = (supabase.from("faturamento_entries") as any).select("*").eq("user_id", user.id);

      if (empresaIdParam) {
        dreBaseQuery = dreBaseQuery.eq("empresa_id", empresaIdParam);
        balancoBaseQuery = balancoBaseQuery.eq("empresa_id", empresaIdParam);
        balanceteBaseQuery = balanceteBaseQuery.eq("empresa_id", empresaIdParam);
        faturamentoBaseQuery = faturamentoBaseQuery.eq("empresa_id", empresaIdParam);
      }

      // Load entries (paginadas)
      const dreEntries = await fetchAllRows(dreBaseQuery);
      const balancoEntries = await fetchAllRows(balancoBaseQuery);
      const balanceteData = await fetchAllRows(balanceteBaseQuery);

      if (balanceteData && balanceteData.length > 0) {
        // Store the periodo from the first entry
        setBalancetePeriodo(balanceteData[0].periodo || "");

        // Map raw data and apply synthetic detection
        const rawBalancete = balanceteData.map((e: any) => ({
          conta: e.conta,
          grupo: e.grupo || "OUTROS",
          saldo_anterior: Number(e.saldo_anterior) || 0,
          debitos: Number(e.debitos) || 0,
          creditos: Number(e.creditos) || 0,
          saldo_atual: Number(e.saldo_atual) || 0,
          natureza: e.natureza || "devedora",
          valor: Number(e.saldo_atual) || 0, // for synthetic detection
          indent_level: inferIndentFromRawRow(e),
        }));

        const balanceteWithDetection = detectSyntheticEntries(rawBalancete);
        const synthBalanceteCount = balanceteWithDetection.filter((e) => e.natureza_conta === "sintetica").length;
        console.log(
          `[Synthetic Detection] ${synthBalanceteCount} sintéticas / ${balanceteWithDetection.length} total (Balancete)`,
        );

        setBalanceteEntries(
          balanceteWithDetection.map((e) => ({
            conta: e.conta,
            grupo: e.grupo,
            saldo_anterior: e.saldo_anterior,
            debitos: e.debitos,
            creditos: e.creditos,
            saldo_atual: e.saldo_atual,
            natureza: e.natureza,
            natureza_conta: e.natureza_conta,
            detection_motivo: e.detection_motivo,
          })),
        );
      }

      // Load Faturamento entries
      let fatData: any[] = [];
      try {
        fatData = await fetchAllRows(faturamentoBaseQuery);
      } catch (e) {
        fatData = [];
      }
      if (fatData && fatData.length > 0) {
        setFaturamentoData(fatData.map((e: any) => ({
          mes: e.mes,
          ano: Number(e.ano),
          saidas: Number(e.saidas) || 0,
          servicos: Number(e.servicos) || 0,
          outros: Number(e.outros) || 0,
          total: Number(e.total) || 0,
        })));
      }

      if (!dreEntries?.length && !balancoEntries?.length && !balanceteData?.length && !fatData?.length) {
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

      // Apply synthetic/analytic detection and contra account detection to Balanço entries
      const isContaRedutora = (conta: string) => {
        const norm = normalizeText(conta);
        return (
          /DEPRECIA/.test(norm) ||
          /AMORTIZA/.test(norm) ||
          /EXAUSTAO/.test(norm) ||
          /PROVISAO.*DEVED/.test(norm) ||
          /PDD/.test(norm) ||
          conta.trim().startsWith("(-)")
        );
      };
      const balancoWithDetection = detectSyntheticEntries(
        (balancoEntries as BalancoEntry[]).map((e) => ({
          ...e,
          indent_level: inferIndentFromRawRow(e),
          is_redutora: isContaRedutora(e.conta),
        })),
      );

      // Log synthetic detection results
      const synthCount = balancoWithDetection.filter((e) => e.natureza_conta === "sintetica").length;
      console.log(`[Synthetic Detection] ${synthCount} sintéticas / ${balancoWithDetection.length} total (Balanço)`);

      // Validate: sum of analytics vs synthetic total
      const validationWarnings = validateAgainstSyntheticTotals(balancoWithDetection);
      if (validationWarnings.length > 0) {
        console.warn("[Synthetic Validation]", validationWarnings);
      }

      // Store raw entries with detection results
      setRawBalancoEntries(balancoWithDetection);
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
        const rows = log.validation_rows as unknown as ValidationRow[];
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
  const classifyDREEntry = (
    descNormalized: string,
    descOriginal: string,
    valor: number,
  ): { grupo: DREClassifiedEntry["grupo"]; isExplicit: boolean; motivo: string } => {
    const desc = descNormalized;
    // ===== RECEITA BRUTA =====
    if (desc.includes("RECEITA BRUTA") || desc.includes("RECEITA OPERACIONAL BRUTA")) {
      const isExplicit = desc === "RECEITA BRUTA" || desc === "RECEITA OPERACIONAL BRUTA" || desc.includes("TOTAL");
      return {
        grupo: "receita_bruta",
        isExplicit,
        motivo: isExplicit ? "Linha explícita de Receita Bruta" : "Componente da Receita Bruta",
      };
    }
    // Vendas/serviços/faturamento são classificados pelo bloco do parser, não por keyword aqui

    // ===== RECEITA LÍQUIDA =====
    if (desc.includes("RECEITA LIQUIDA") || desc.includes("RECEITA OPERACIONAL LIQUIDA")) {
      return { grupo: "receita_liquida", isExplicit: true, motivo: "Linha explícita de Receita Líquida" };
    }

    // ===== CMV =====
    if (
      desc.includes("CMV") ||
      desc.includes("CPV") ||
      desc.includes("CUSTO DA MERCADORIA") ||
      desc.includes("CUSTO DAS MERCADORIAS") ||
      desc.includes("CUSTO DOS PRODUTOS") ||
      desc.includes("CUSTO DOS SERVICOS")
    ) {
      const isExplicit =
        desc === "CMV" ||
        desc === "CPV" ||
        desc === "CUSTO DA MERCADORIA VENDIDA" ||
        desc === "CUSTO DAS MERCADORIAS VENDIDAS" ||
        desc === "CUSTO DOS PRODUTOS VENDIDOS" ||
        desc === "CUSTO DOS SERVICOS PRESTADOS" ||
        desc.includes("TOTAL");
      return { grupo: "cmv", isExplicit, motivo: isExplicit ? "Linha explícita de CMV" : "Componente de CMV" };
    }

    // ===== LUCRO BRUTO =====
    if (desc === "LUCRO BRUTO" || desc === "RESULTADO BRUTO") {
      return { grupo: "lucro_bruto", isExplicit: true, motivo: "Linha explícita de Lucro Bruto" };
    }

    // ===== DESPESAS OPERACIONAIS =====
    if (
      desc.includes("DESPESAS OPERACIONAIS") ||
      desc.includes("DESPESAS ADMINISTRATIVAS") ||
      desc.includes("DESPESAS COM VENDAS") ||
      desc.includes("DESPESAS GERAIS") ||
      desc.includes("DESPESAS TRABALHISTAS")
    ) {
      const isExplicit =
        desc === "DESPESAS OPERACIONAIS" ||
        desc === "TOTAL DESPESAS OPERACIONAIS" ||
        desc === "TOTAL DAS DESPESAS OPERACIONAIS" ||
        (desc.includes("TOTAL") && desc.includes("DESPESAS"));
      return {
        grupo: "despesas_operacionais",
        isExplicit,
        motivo: isExplicit ? "Linha explícita de Despesas Operacionais" : "Componente de Despesas Operacionais",
      };
    }

    // ===== LUCRO OPERACIONAL =====
    // Inclui: LUCRO OPERACIONAL, RESULTADO OPERACIONAL, e qualquer conta com "OPERACIONAL LIQUIDO"
    if (desc === "LUCRO OPERACIONAL" || desc === "RESULTADO OPERACIONAL" || desc.includes("OPERACIONAL LIQUIDO")) {
      return { grupo: "lucro_operacional", isExplicit: true, motivo: "Linha explícita de Lucro Operacional" };
    }

    // ===== NÃO OPERACIONAL (categoria separada) =====
    // Detectar itens NÃO OPERACIONAIS (com ou sem acento, maiúsculo/minúsculo)
    const isNaoOperacional =
      desc.includes("NAO OPERACIONAL") ||
      desc.includes("NÃO OPERACIONAL") ||
      desc.includes("NAO OPERACIONAIS") ||
      desc.includes("NÃO OPERACIONAIS") ||
      descOriginal.toUpperCase().includes("NÃO OPERACIONAL") ||
      descOriginal.toUpperCase().includes("NAO OPERACIONAL");

    if (isNaoOperacional) {
      return { grupo: "nao_operacional", isExplicit: false, motivo: "Item Não Operacional" };
    }

    // ===== ALIENAÇÃO → NÃO OPERACIONAL =====
    if (desc.includes("ALIENACAO") || descOriginal.toUpperCase().includes("ALIENAÇÃO")) {
      return { grupo: "nao_operacional", isExplicit: false, motivo: "Conta de Alienação (Não Operacional)" };
    }

    // ===== RESULTADO FINANCEIRO (apenas headers de bloco — classificação real é feita pelo bloco) =====
    if (
      desc === "RESULTADO FINANCEIRO" ||
      desc === "RESULTADO FINANCEIRO LIQUIDO" ||
      (desc.includes("TOTAL") && desc.includes("FINANCEIRO"))
    ) {
      return { grupo: "resultado_financeiro", isExplicit: true, motivo: "Linha explícita de Resultado Financeiro" };
    }

    // ===== PROVISÕES (contas que começam com "PROVISÃO" ou "PROVISAO") — ANTES de Contribuição Social e IRPJ =====
    if (
      desc.startsWith("PROVISAO") ||
      desc.startsWith("PROVISÃO") ||
      descOriginal.toUpperCase().startsWith("PROVISÃO") ||
      descOriginal.toUpperCase().startsWith("PROVISAO")
    ) {
      return { grupo: "provisoes", isExplicit: false, motivo: "Provisão (começa com PROVISÃO)" };
    }

    // ===== CONTAS RESULTADO (contas que começam com "RESULTADO" — prioridade sobre CSLL e IR) =====
    if (desc.startsWith("RESULTADO")) {
      // Exceto as já capturadas acima (RESULTADO FINANCEIRO, RESULTADO BRUTO, RESULTADO OPERACIONAL, RESULTADO LÍQUIDO)
      return { grupo: "contas_resultado", isExplicit: false, motivo: "Conta de Resultado (começa com RESULTADO)" };
    }

    // ===== CONTRIBUIÇÃO SOCIAL (não começa com RESULTADO) =====
    if (desc.includes("CONTRIBUICAO SOCIAL") || desc.includes("CSLL")) {
      const isExplicit = desc === "CONTRIBUICAO SOCIAL" || desc === "CSLL";
      return {
        grupo: "contribuicao_social",
        isExplicit,
        motivo: isExplicit ? "Linha explícita de Contribuição Social" : "Componente de Contribuição Social",
      };
    }

    // ===== IR / IRPJ / IMPOSTO DE RENDA (não começa com RESULTADO) =====
    if (
      desc.includes("IRPJ") ||
      desc.includes("IMPOSTO DE RENDA") ||
      desc.includes(" IR ") ||
      desc.endsWith(" IR") ||
      desc === "IR"
    ) {
      return { grupo: "ir", isExplicit: false, motivo: "Imposto de Renda (IR/IRPJ)" };
    }

    if (
      desc.includes("LUCRO LIQUIDO") ||
      desc.includes("RESULTADO LIQUIDO") ||
      desc.includes("LUCRO DO EXERCICIO") ||
      desc.includes("RESULTADO DO EXERCICIO") ||
      desc.includes("LUCRO DO PERIODO") ||
      desc.includes("PREJUIZO DO EXERCICIO") ||
      desc.includes("PREJUIZO DO PERIODO") ||
      desc.includes("PREJUIZO LIQUIDO")
    ) {
      return { grupo: "lucro_liquido", isExplicit: true, motivo: "Linha explícita de Lucro Líquido / Prejuízo" };
    }

    // ===== CONTAS QUE COMEÇAM COM "IMPOSTOS", "MULTAS" ou "TAXAS" → DESPESAS TRIBUTÁRIAS =====
    if (desc.startsWith("IMPOSTOS") || desc.startsWith("MULTAS") || desc.startsWith("TAXAS")) {
      return {
        grupo: "despesas_operacionais",
        isExplicit: false,
        motivo: "Despesa Tributária (Impostos/Multas/Taxas)",
      };
    }

    // Deduções são classificadas pelo bloco do parser (entre Receita Operacional e Receita Líquida = DEDUCOES)

    // ===== FALLBACK: Contas não classificadas vão para DESPESAS OPERACIONAIS =====
    return {
      grupo: "despesas_operacionais",
      isExplicit: false,
      motivo: "Classificado como Despesa Operacional (fallback)",
    };
  };

  /**
   * Calculate DRE metrics with classification for debug
   * Includes range-based CMV block detection (ESTOQUE INICIAL → ESTOQUE FINAL)
   */
  const calculateDREMetricsWithClassification = (
    entries: DREEntry[],
  ): { metrics: CalculatedDRE; classifiedEntries: DREClassifiedEntry[] } => {
    const metrics: CalculatedDRE = {
      receitaBruta: 0,
      receitaBrutaOrigem: "soma_contas",
      receitaLiquida: 0,
      receitaLiquidaOrigem: "soma_contas",
      cmv: 0,
      cmvOrigem: "soma_contas",
      lucroBruto: 0,
      lucroBrutoOrigem: "soma_contas",
      despesasOperacionais: 0,
      despesasOperacionaisOrigem: "soma_contas",
      lucroOperacional: 0,
      lucroOperacionalOrigem: "soma_contas",
      resultadoFinanceiro: 0,
      resultadoFinanceiroOrigem: "soma_contas",
      contribuicaoSocial: 0,
      contribuicaoSocialOrigem: "soma_contas",
      lucroLiquido: 0,
      lucroLiquidoOrigem: "soma_contas",
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
    const mapGrupo = (parserGrupo: string): DREClassifiedEntry["grupo"] => {
      const map: Record<string, DREClassifiedEntry["grupo"]> = {
        RECEITA_BRUTA: "receita_bruta",
        RECEITA_LIQUIDA: "receita_liquida",
        CMV: "cmv",
        LUCRO_BRUTO: "lucro_bruto",
        DESPESAS_OPERACIONAIS: "despesas_operacionais",
        DEDUCOES: "despesas_operacionais",
        LUCRO_OPERACIONAL: "lucro_operacional",
        RESULTADO_FINANCEIRO: "resultado_financeiro",
        NAO_OPERACIONAL: "nao_operacional",
        CONTRIBUICAO_SOCIAL: "contribuicao_social",
        LUCRO_LIQUIDO: "lucro_liquido",
        CONTAS_RESULTADO: "contas_resultado",
        PROVISOES: "provisoes",
        IR: "ir",
      };
      return map[parserGrupo] || "despesas_operacionais";
    };

    for (const entry of entries) {
      const desc = normalizeText(entry.descricao);
      const valor = entry.valor;
      const valorAbs = Math.abs(valor);

      // Use stored grupo from parser (falls back to classifyDREEntry if no grupo stored)
      let grupo: DREClassifiedEntry["grupo"];
      let motivo: string;
      let isExplicit: boolean;

      if (entry.grupo && entry.grupo !== "OUTROS") {
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
        insideCMVBlock: grupo === "cmv",
      });

      // Acumular baseado no grupo classificado (para fallback)
      if (grupo === "despesas_operacionais") {
        somaDespesasOperacionais += valorAbs;
      }
      if (grupo === "resultado_financeiro") {
        somaResultadoFinanceiro += valor;
      }
      if (grupo === "cmv") {
        somaCMV += valor;
      }
      if (grupo === "receita_bruta") {
        somaReceitaBruta += valorAbs;
      }

      // ===== RECEITA BRUTA (linha explícita) =====
      if (desc.includes("RECEITA BRUTA") || desc.includes("RECEITA OPERACIONAL BRUTA")) {
        if (desc === "RECEITA BRUTA" || desc === "RECEITA OPERACIONAL BRUTA" || desc.includes("TOTAL")) {
          if (!foundReceitaBruta) {
            metrics.receitaBruta = valorAbs;
            metrics.receitaBrutaOrigem = "linha_explicita";
            foundReceitaBruta = true;
          }
        }
      }

      // ===== RECEITA LÍQUIDA =====
      if (desc.includes("RECEITA LIQUIDA") || desc.includes("RECEITA OPERACIONAL LIQUIDA")) {
        if (!foundReceitaLiquida) {
          metrics.receitaLiquida = valorAbs;
          metrics.receitaLiquidaOrigem = "linha_explicita";
          foundReceitaLiquida = true;
        }
      }

      // ===== CMV (linha explícita) =====
      if (
        desc.includes("CMV") ||
        desc.includes("CPV") ||
        desc.includes("CUSTO DA MERCADORIA") ||
        desc.includes("CUSTO DAS MERCADORIAS") ||
        desc.includes("CUSTO DOS PRODUTOS") ||
        desc.includes("CUSTO DOS SERVICOS")
      ) {
        const isTotal =
          desc === "CMV" ||
          desc === "CPV" ||
          desc === "CUSTO DA MERCADORIA VENDIDA" ||
          desc === "CUSTO DAS MERCADORIAS VENDIDAS" ||
          desc === "CUSTO DOS PRODUTOS VENDIDOS" ||
          desc === "CUSTO DOS SERVICOS PRESTADOS" ||
          desc.includes("TOTAL");
        if (isTotal && !foundCMV) {
          metrics.cmv = valor;
          metrics.cmvOrigem = "linha_explicita";
          foundCMV = true;
        }
      }

      // ===== LUCRO BRUTO =====
      if (desc === "LUCRO BRUTO" || desc === "RESULTADO BRUTO") {
        if (!foundLucroBruto) {
          metrics.lucroBruto = valorAbs;
          metrics.lucroBrutoOrigem = "linha_explicita";
          foundLucroBruto = true;
        }
      }

      // ===== DESPESAS OPERACIONAIS (linha explícita) =====
      if (
        desc.includes("DESPESAS OPERACIONAIS") ||
        desc.includes("DESPESAS ADMINISTRATIVAS") ||
        desc.includes("DESPESAS COM VENDAS") ||
        desc.includes("DESPESAS GERAIS") ||
        desc.includes("DESPESAS TRABALHISTAS")
      ) {
        const isTotal =
          desc === "DESPESAS OPERACIONAIS" ||
          desc === "TOTAL DESPESAS OPERACIONAIS" ||
          desc === "TOTAL DAS DESPESAS OPERACIONAIS" ||
          (desc.includes("TOTAL") && desc.includes("DESPESAS"));
        if (isTotal && !foundDespesasOp) {
          metrics.despesasOperacionais = valorAbs;
          metrics.despesasOperacionaisOrigem = "linha_explicita";
          foundDespesasOp = true;
        }
      }

      // ===== LUCRO OPERACIONAL =====
      if (desc === "LUCRO OPERACIONAL" || desc === "RESULTADO OPERACIONAL" || desc.includes("OPERACIONAL LIQUIDO")) {
        if (!foundLucroOp) {
          metrics.lucroOperacional = valorAbs;
          metrics.lucroOperacionalOrigem = "linha_explicita";
          foundLucroOp = true;
        }
      }

      // ===== RESULTADO FINANCEIRO (linha explícita total) =====
      if (
        desc === "RESULTADO FINANCEIRO" ||
        desc === "RESULTADO FINANCEIRO LIQUIDO" ||
        (desc.includes("TOTAL") && desc.includes("FINANCEIRO"))
      ) {
        if (!foundResultadoFin) {
          metrics.resultadoFinanceiro = valor;
          metrics.resultadoFinanceiroOrigem = "linha_explicita";
          foundResultadoFin = true;
        }
      }

      // ===== LUCRO LÍQUIDO =====
      if (
        desc.includes("LUCRO LIQUIDO") ||
        desc.includes("RESULTADO LIQUIDO") ||
        desc.includes("LUCRO DO EXERCICIO") ||
        desc.includes("RESULTADO DO EXERCICIO") ||
        desc.includes("LUCRO DO PERIODO") ||
        desc.includes("PREJUIZO DO EXERCICIO") ||
        desc.includes("PREJUIZO DO PERIODO") ||
        desc.includes("PREJUIZO LIQUIDO")
      ) {
        if (!foundLucroLiq) {
          // Prejuízo deve ser negativo; lucro positivo
          const isPrejuizo = desc.includes("PREJUIZO");
          metrics.lucroLiquido = isPrejuizo ? -valorAbs : valorAbs;
          metrics.lucroLiquidoOrigem = "linha_explicita";
          foundLucroLiq = true;
        }
      }
    }

    // ===== FALLBACKS =====
    if (!foundReceitaBruta && somaReceitaBruta > 0) {
      metrics.receitaBruta = somaReceitaBruta;
      metrics.receitaBrutaOrigem = "soma_contas";
    }

    if (!foundReceitaLiquida && metrics.receitaBruta > 0) {
      metrics.receitaLiquida = metrics.receitaBruta;
      metrics.receitaLiquidaOrigem = metrics.receitaBrutaOrigem;
    }

    if (!foundCMV && somaCMV !== 0) {
      metrics.cmv = somaCMV;
      metrics.cmvOrigem = "soma_contas";
    }

    if (!foundDespesasOp && somaDespesasOperacionais > 0) {
      metrics.despesasOperacionais = somaDespesasOperacionais;
      metrics.despesasOperacionaisOrigem = "soma_contas";
    }

    if (!foundResultadoFin && somaResultadoFinanceiro !== 0) {
      metrics.resultadoFinanceiro = somaResultadoFinanceiro;
      metrics.resultadoFinanceiroOrigem = "soma_contas";
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
  const getDREGroupColor = (grupo: DREClassifiedEntry["grupo"]): string => {
    const colors: Record<DREClassifiedEntry["grupo"], string> = {
      receita_bruta: "bg-green-500/20 text-green-400 border-green-500/30",
      receita_liquida: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      cmv: "bg-red-500/20 text-red-400 border-red-500/30",
      lucro_bruto: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      despesas_operacionais: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      lucro_operacional: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      resultado_financeiro: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      contribuicao_social: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
      nao_operacional: "bg-pink-500/20 text-pink-400 border-pink-500/30",
      lucro_liquido: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      contas_resultado: "bg-teal-500/20 text-teal-400 border-teal-500/30",
      provisoes: "bg-rose-500/20 text-rose-400 border-rose-500/30",
      ir: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    };
    return colors[grupo];
  };

  /**
   * Get label for DRE group
   */
  const getDREGroupLabel = (grupo: DREClassifiedEntry["grupo"]): string => {
    const labels: Record<DREClassifiedEntry["grupo"], string> = {
      receita_bruta: "Receita Bruta",
      receita_liquida: "Receita Líquida",
      cmv: "CMV",
      lucro_bruto: "Lucro Bruto",
      despesas_operacionais: "Despesas Operacionais",
      lucro_operacional: "Lucro Operacional",
      resultado_financeiro: "Resultado Financeiro",
      contribuicao_social: "Contribuição Social",
      nao_operacional: "Não Operacional",
      lucro_liquido: "Lucro Líquido",
      contas_resultado: "Contas Resultado",
      provisoes: "Provisões",
      ir: "Imposto de Renda",
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
    /**
     * Resolve o valor com sinal correto a partir da natureza contábil (D/C).
     * - ATIVO:   D = positivo, C = negativo (redutora / saldo invertido)
     * - PASSIVO: C = positivo, D = negativo (saldo invertido)
     * - PL:      C = positivo, D = negativo (prejuízo / PL negativo)
     */
    const resolveSignedValue = (entry: BalancoEntry, secao: "ATIVO" | "PASSIVO" | "PL"): number => {
      const raw = Math.abs(Number(entry.valor) || 0);
      const nat = (entry.natureza || "").toString().toLowerCase();
      const isDevedor = nat === "d" || nat === "devedor" || nat === "devedora";
      const isCredor = nat === "c" || nat === "credor" || nat === "credora";
      if (secao === "ATIVO") return isCredor ? -raw : raw;
      if (secao === "PASSIVO") return isDevedor ? -raw : raw;
      if (secao === "PL") return isDevedor ? -raw : raw;
      return raw;
    };

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
      const conta = normalizeText(entry.conta);

      // 1. Line "ATIVO" → ATIVO_TOTAL
      if (conta === "ATIVO") {
        ativoTotal = resolveSignedValue(entry, "ATIVO");
        inAtivoSection = true;
        inPassivoSection = false;
        continue;
      }

      // 4. Line "PASSIVO" → PASSIVO_TOTAL
      if (conta === "PASSIVO") {
        passivoTotal = resolveSignedValue(entry, "PASSIVO");
        inAtivoSection = false;
        inPassivoSection = true;
        continue;
      }

      // 2./5. Line "CIRCULANTE"
      if (conta === "CIRCULANTE") {
        if (inAtivoSection && !foundAtivoCirculante) {
          ativoCirculante = resolveSignedValue(entry, "ATIVO");
          foundAtivoCirculante = true;
        } else if (inPassivoSection && !foundPassivoCirculante) {
          passivoCirculante = resolveSignedValue(entry, "PASSIVO");
          foundPassivoCirculante = true;
        }
        continue;
      }

      // 3. Line "ATIVO NAO CIRCULANTE" or "NAO CIRCULANTE" under ATIVO
      if (conta === "ATIVO NAO CIRCULANTE" || (conta === "NAO CIRCULANTE" && inAtivoSection)) {
        ativoNaoCirculante = resolveSignedValue(entry, "ATIVO");
        continue;
      }

      // 6. Line "PASSIVO NAO CIRCULANTE" or "NAO CIRCULANTE" under PASSIVO
      if (conta === "PASSIVO NAO CIRCULANTE" || (conta === "NAO CIRCULANTE" && inPassivoSection)) {
        passivoNaoCirculante = resolveSignedValue(entry, "PASSIVO");
        continue;
      }

      // 7. Line "PATRIMONIO LIQUIDO"
      if (conta === "PATRIMONIO LIQUIDO") {
        patrimonioLiquido = resolveSignedValue(entry, "PL");
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
      patrimonioLiquido,
    };
  };

  /**
   * Generate diagnostic lines for debugging import issues
   */
  const generateDiagnosticLines = (entries: BalancoEntry[]): DiagnosticLine[] => {
    const keyAccounts = [
      "ATIVO",
      "CIRCULANTE",
      "NAO CIRCULANTE",
      "ATIVO NAO CIRCULANTE",
      "PASSIVO",
      "PASSIVO NAO CIRCULANTE",
      "PATRIMONIO LIQUIDO",
    ];
    const diagnostics: DiagnosticLine[] = [];

    // Track section context
    let currentSection: "ATIVO" | "PASSIVO" | "PL" = "ATIVO";
    let foundAtivoCirculante = false;
    let foundPassivoCirculante = false;

    for (const entry of entries) {
      const contaNorm = normalizeText(entry.conta);

      let secao: "ATIVO" | "PASSIVO" | "PL" | "-" = currentSection;
      let motivo = "";
      let tipoClassificado = entry.tipo;

      if (contaNorm === "ATIVO") {
        currentSection = "ATIVO";
        secao = "ATIVO";
        foundAtivoCirculante = false;
        motivo = "Início da seção ATIVO";
      } else if (contaNorm === "PASSIVO") {
        currentSection = "PASSIVO";
        secao = "PASSIVO";
        foundPassivoCirculante = false;
        motivo = "Início da seção PASSIVO";
      } else if (contaNorm.includes("PATRIMONIO LIQUIDO")) {
        currentSection = "PL";
        secao = "PL";
        motivo = "Patrimônio Líquido detectado";
      } else if (contaNorm === "CIRCULANTE" || contaNorm.startsWith("CIRCULANTE")) {
        secao = currentSection;
        if (currentSection === "ATIVO" && !foundAtivoCirculante) {
          foundAtivoCirculante = true;
          motivo = `PRIMEIRO "CIRCULANTE" na seção ATIVO → ATIVO_CIRCULANTE`;
        } else if (currentSection === "PASSIVO" && !foundPassivoCirculante) {
          foundPassivoCirculante = true;
          motivo = `PRIMEIRO "CIRCULANTE" na seção PASSIVO → PASSIVO_CIRCULANTE`;
        } else {
          motivo = `"CIRCULANTE" adicional - subconta de ${tipoClassificado}`;
        }
      } else if (contaNorm === "ATIVO CIRCULANTE") {
        secao = "ATIVO";
        foundAtivoCirculante = true;
        motivo = '"ATIVO CIRCULANTE" explícito';
      } else if (contaNorm === "PASSIVO CIRCULANTE") {
        secao = "PASSIVO";
        foundPassivoCirculante = true;
        motivo = '"PASSIVO CIRCULANTE" explícito';
      } else if (contaNorm.includes("NAO CIRCULANTE")) {
        secao = currentSection;
        motivo =
          currentSection === "ATIVO"
            ? '"NÃO CIRCULANTE" na seção ATIVO → ATIVO_NAO_CIRCULANTE'
            : '"NÃO CIRCULANTE" na seção PASSIVO → PASSIVO_NAO_CIRCULANTE';
      } else {
        secao = currentSection;
        motivo = `Herda tipo da seção atual (${currentSection})`;
      }

      const isKeyAccount = keyAccounts.some((k) => contaNorm === k || contaNorm.includes(k));

      if (isKeyAccount) {
        const hasValor = entry.valor !== 0;
        const hasValorAnterior = entry.valor_anterior !== null && entry.valor_anterior !== 0;

        diagnostics.push({
          conta: entry.conta,
          valor: entry.valor,
          valorAnterior: entry.valor_anterior,
          colunaUsada: hasValor ? "atual" : hasValorAnterior ? "anterior" : "nenhuma",
          encontrado: hasValor || hasValorAnterior,
          secao,
          tipoClassificado,
          motivo,
        });
      }
    }

    return diagnostics;
  };

  const generateInsights = (dre: CalculatedDRE, balanco: CalculatedBalanco): string[] => {
    const insights: string[] = [];

    if (dre.margemLiquida > 20) {
      insights.push(
        "✅ Margem líquida excelente, acima de 20%. A empresa demonstra alta eficiência na conversão de receitas em lucro.",
      );
    } else if (dre.margemLiquida > 10) {
      insights.push("👍 Margem líquida saudável entre 10-20%. Há espaço para otimização de custos.");
    } else if (dre.margemLiquida > 0) {
      insights.push(
        "⚠️ Margem líquida abaixo de 10%. Recomenda-se revisão de custos operacionais e estratégia de preços.",
      );
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
        insights.push(
          "💰 Liquidez corrente excelente. A empresa tem folga financeira para honrar compromissos de curto prazo.",
        );
      } else if (liquidezGeral > 1) {
        insights.push("💵 Liquidez corrente adequada. Ativo circulante cobre as obrigações de curto prazo.");
      } else {
        insights.push(
          "⚠️ Liquidez corrente preocupante. Pode haver dificuldades no pagamento de obrigações de curto prazo.",
        );
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
              grupo: edited.grupo as DREClassifiedEntry["grupo"],
              valor: edited.valor,
              motivo: "Modificado manualmente pelo usuário",
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
    [rawBalancoEntries, rawDreEntries, dreClassifiedEntries],
  );

  // Recalculate DRE metrics from classified entries (used after manual edit)
  const recalculateDREMetricsFromClassified = (entries: DREClassifiedEntry[]): CalculatedDRE => {
    const metrics: CalculatedDRE = {
      receitaBruta: 0,
      receitaBrutaOrigem: "soma_contas",
      receitaLiquida: 0,
      receitaLiquidaOrigem: "soma_contas",
      cmv: 0,
      cmvOrigem: "soma_contas",
      lucroBruto: 0,
      lucroBrutoOrigem: "soma_contas",
      despesasOperacionais: 0,
      despesasOperacionaisOrigem: "soma_contas",
      lucroOperacional: 0,
      lucroOperacionalOrigem: "soma_contas",
      resultadoFinanceiro: 0,
      resultadoFinanceiroOrigem: "soma_contas",
      contribuicaoSocial: 0,
      contribuicaoSocialOrigem: "soma_contas",
      lucroLiquido: 0,
      lucroLiquidoOrigem: "soma_contas",
      margemBruta: 0,
      margemOperacional: 0,
      margemLiquida: 0,
    };

    // Find explicit lines first, then sum components
    for (const entry of entries) {
      const valorAbs = Math.abs(entry.valor);

      switch (entry.grupo) {
        case "receita_bruta":
          if (entry.isExplicit && metrics.receitaBruta === 0) {
            metrics.receitaBruta = valorAbs;
            metrics.receitaBrutaOrigem = "linha_explicita";
          } else if (!entry.isExplicit) {
            if (metrics.receitaBrutaOrigem !== "linha_explicita") {
              metrics.receitaBruta += valorAbs;
            }
          }
          break;
        case "receita_liquida":
          if (metrics.receitaLiquida === 0) {
            metrics.receitaLiquida = valorAbs;
            metrics.receitaLiquidaOrigem = "linha_explicita";
          }
          break;
        case "cmv":
          if (entry.isExplicit && metrics.cmv === 0) {
            metrics.cmv = entry.valor; // Keep sign
            metrics.cmvOrigem = "linha_explicita";
          } else if (!entry.isExplicit) {
            if (metrics.cmvOrigem !== "linha_explicita") {
              metrics.cmv += entry.valor;
            }
          }
          break;
        case "lucro_bruto":
          if (metrics.lucroBruto === 0) {
            metrics.lucroBruto = valorAbs;
            metrics.lucroBrutoOrigem = "linha_explicita";
          }
          break;
        case "despesas_operacionais":
          if (entry.isExplicit && metrics.despesasOperacionais === 0) {
            metrics.despesasOperacionais = valorAbs;
            metrics.despesasOperacionaisOrigem = "linha_explicita";
          } else if (!entry.isExplicit) {
            if (metrics.despesasOperacionaisOrigem !== "linha_explicita") {
              metrics.despesasOperacionais += valorAbs;
            }
          }
          break;
        case "lucro_operacional":
          if (metrics.lucroOperacional === 0) {
            metrics.lucroOperacional = valorAbs;
            metrics.lucroOperacionalOrigem = "linha_explicita";
          }
          break;
        case "resultado_financeiro":
          if (entry.isExplicit && metrics.resultadoFinanceiro === 0) {
            metrics.resultadoFinanceiro = entry.valor;
            metrics.resultadoFinanceiroOrigem = "linha_explicita";
          } else if (!entry.isExplicit) {
            if (metrics.resultadoFinanceiroOrigem !== "linha_explicita") {
              metrics.resultadoFinanceiro += entry.valor;
            }
          }
          break;
        case "lucro_liquido":
          if (metrics.lucroLiquido === 0) {
            // Preservar sinal negativo para prejuízo
            metrics.lucroLiquido = entry.valor < 0 ? entry.valor : valorAbs;
            metrics.lucroLiquidoOrigem = "linha_explicita";
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

  const fetchPdfAiAnalysis = async (): Promise<typeof pdfAiData> => {
    if (!dreData || !balancoData) return null;
    try {
      setIsFetchingPdfAi(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;

      // EBITDA estimate (lucro operacional + depreciações/amortizações)
      const depreciacaoLocal = dreClassifiedEntries
        .filter(e => /DEPRECIA|AMORTIZA/i.test(e.descricao.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
        .reduce((s, e) => s + Math.abs(e.valor), 0);
      const ebitdaLocal = dreData.lucroOperacional + depreciacaoLocal;

      // Edge function expects passivoTotal alongside the rest
      const balancoPayload = {
        ativoCirculante: balancoData.ativoCirculante,
        ativoNaoCirculante: balancoData.ativoNaoCirculante,
        ativoTotal: balancoData.ativoTotal,
        passivoCirculante: balancoData.passivoCirculante,
        passivoNaoCirculante: balancoData.passivoNaoCirculante,
        passivoTotal: balancoData.passivoCirculante + balancoData.passivoNaoCirculante,
        patrimonioLiquido: balancoData.patrimonioLiquido,
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-presentation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            dre: dreData,
            balanco: balancoPayload,
            empresaNome: selectedEmpresa?.nome,
            empresaCnpj: selectedEmpresa?.cnpj,
            empresaCnae: selectedEmpresa?.cnae,
            empresaRegimeTributario: selectedEmpresa?.regime_tributario,
            empresaContexto: selectedEmpresa?.contexto,
            ebitda: ebitdaLocal,
            periodo: new Date().getFullYear().toString(),
            nonStreaming: true,
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error('[fetchPdfAiAnalysis] HTTP', response.status, errText.substring(0, 500));
        return null;
      }

      const parsed = await response.json();
      if (parsed?.error) {
        console.error('[fetchPdfAiAnalysis] AI error:', parsed.error);
        return null;
      }
      return parsed;
    } catch (e) {
      console.error('fetchPdfAiAnalysis error:', e);
      return null;
    } finally {
      setIsFetchingPdfAi(false);
    }
  };

  const handleExportPDF = async () => {
    if (!dreData || !balancoData) return;
    setIsExporting(true);

    try {
      let aiData = pdfAiData;
      if (!aiData) {
        aiData = await fetchPdfAiAnalysis();
        if (aiData) setPdfAiData(aiData);
      }

      const brl = (v: number) => {
        const neg = v < 0;
        const s = Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return neg ? `-${s}` : s;
      };
      const pct = (v: number) => `${v.toFixed(2)}%`;
      const fmt = (v: number) => {
        if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
        if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`;
        return brl(v);
      };

      const depreciacao = dreClassifiedEntries
        .filter(e => /DEPRECIA|AMORTIZA/i.test(e.descricao.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
        .reduce((s, e) => s + Math.abs(e.valor), 0);
      const ebitda       = dreData.lucroOperacional + depreciacao;
      const margemEbitda = dreData.receitaLiquida > 0 ? (ebitda / dreData.receitaLiquida) * 100 : 0;
      const liqCorrente  = balancoData.passivoCirculante > 0 ? balancoData.ativoCirculante / balancoData.passivoCirculante : 0;
      const liqSeca      = balancoData.passivoCirculante > 0 ? (balancoData.ativoCirculante * 0.7) / balancoData.passivoCirculante : 0;
      const liqGeral     = (balancoData.passivoCirculante + balancoData.passivoNaoCirculante) > 0
        ? (balancoData.ativoCirculante + balancoData.ativoNaoCirculante * 0.3) / (balancoData.passivoCirculante + balancoData.passivoNaoCirculante) : 0;
      const endivGeral   = balancoData.ativoTotal > 0 ? ((balancoData.passivoCirculante + balancoData.passivoNaoCirculante) / balancoData.ativoTotal) * 100 : 0;
      const endivCP      = (balancoData.passivoCirculante + balancoData.passivoNaoCirculante) > 0
        ? (balancoData.passivoCirculante / (balancoData.passivoCirculante + balancoData.passivoNaoCirculante)) * 100 : 0;
      const roe          = balancoData.patrimonioLiquido > 0 ? (dreData.lucroLiquido / balancoData.patrimonioLiquido) * 100 : 0;
      const roa          = balancoData.ativoTotal > 0 ? (dreData.lucroLiquido / balancoData.ativoTotal) * 100 : 0;
      const giroAtivo    = balancoData.ativoTotal > 0 ? dreData.receitaLiquida / balancoData.ativoTotal : 0;
      const plPctAtivo   = balancoData.ativoTotal > 0 ? (Math.abs(balancoData.patrimonioLiquido) / balancoData.ativoTotal) * 100 : 0;

      const brandName  = branding?.nome_empresa || 'ProCont';
      const clientName = selectedEmpresa?.nome || 'Empresa';
      const clientCnpj = selectedEmpresa?.cnpj || '';
      const clientCnae = selectedEmpresa?.cnae || '';
      const clientReg  = selectedEmpresa?.regime_tributario || '';
      const hoje       = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      const periodo    = '01/01/2025 a 31/12/2025';
      const paginaRodape = `${clientName}${clientCnpj ? ' | ' + clientCnpj : ''}`;

      const chartEls = document.querySelectorAll('.recharts-responsive-container');
      const chartImgs: string[] = [];
      for (let i = 0; i < Math.min(chartEls.length, 4); i++) {
        try {
          const { default: html2canvas } = await import('html2canvas');
          const canvas = await html2canvas(chartEls[i] as HTMLElement, {
            scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false
          });
          chartImgs.push(canvas.toDataURL('image/png'));
        } catch { chartImgs.push(''); }
      }

      const chartDRE  = chartImgs[0] ? `<img src="${chartImgs[0]}" style="width:48%;border-radius:8px;" />` : '';
      const chartMarg = chartImgs[1] ? `<img src="${chartImgs[1]}" style="width:48%;border-radius:8px;" />` : '';
      const chartBP   = chartImgs[2] ? `<img src="${chartImgs[2]}" style="width:48%;border-radius:8px;" />` : '';
      const chartCap  = chartImgs[3] ? `<img src="${chartImgs[3]}" style="width:48%;border-radius:8px;" />` : '';

      const logoHtml = branding?.logo_url
        ? `<img src="${branding.logo_url}" style="max-height:64px;max-width:200px;margin-bottom:16px;object-fit:contain;" crossorigin="anonymous" />`
        : `<div style="font-size:32px;font-weight:800;color:#4A7FC1;margin-bottom:16px;">${brandName}</div>`;

      const dreRow = (label: string, valor: number, pctVal: number, negativo = false, destaque = false, subtotal = false) => {
        const cor = destaque ? '#1E2A4A' : subtotal ? '#EFF6FF' : '#ffffff';
        const txtCor = destaque ? '#ffffff' : '#1E293B';
        const fontW = (destaque || subtotal) ? '700' : '400';
        const valStr = negativo ? `-${brl(Math.abs(valor))}` : brl(valor);
        const pctStr = negativo ? `-${Math.abs(pctVal).toFixed(2)}%` : `${pctVal.toFixed(2)}%`;
        return `
          <tr style="background:${cor};">
            <td style="padding:7px 12px;font-size:13px;color:${txtCor};font-weight:${fontW};border-bottom:1px solid #E5E7EB;">${label}</td>
            <td style="padding:7px 12px;font-size:13px;color:${negativo ? '#DC2626' : txtCor};font-weight:${fontW};text-align:right;border-bottom:1px solid #E5E7EB;">${valStr}</td>
            <td style="padding:7px 12px;font-size:13px;color:${negativo ? '#DC2626' : txtCor};font-weight:${fontW};text-align:right;border-bottom:1px solid #E5E7EB;">${pctStr}</td>
          </tr>`;
      };

      const bpRow = (label: string, valor: number, pctAtivo: number, negativo = false, destaque = false, subconta = false) => {
        const cor = destaque ? '#1E2A4A' : '#ffffff';
        const isNeg = valor < 0;
        const txtCor = destaque ? '#ffffff' : (isNeg ? '#DC2626' : '#1E293B');
        const fontW = destaque ? '700' : (isNeg ? '700' : '400');
        const indent = subconta ? 'padding-left:28px;' : '';
        // Preserve negative sign — critical for Patrimônio Líquido negativo
        const valStr = brl(valor);
        const pctStr = pctAtivo !== 0 ? `${pctAtivo.toFixed(2)}%` : '';
        const pctCor = destaque ? '#ffffff' : (pctAtivo < 0 ? '#DC2626' : '#6B7280');
        return `
          <tr style="background:${cor};">
            <td style="padding:6px 12px;${indent}font-size:12.5px;color:${txtCor};font-weight:${fontW};border-bottom:1px solid #E5E7EB;">${label}</td>
            <td style="padding:6px 12px;font-size:12.5px;color:${txtCor};font-weight:${fontW};text-align:right;border-bottom:1px solid #E5E7EB;">${valStr}</td>
            <td style="padding:6px 12px;font-size:12.5px;color:${pctCor};text-align:right;border-bottom:1px solid #E5E7EB;">${pctStr}</td>
          </tr>`;
      };

      const indRow = (label: string, valor: string, ref: string, ok: boolean, interp: string, alerta = false) => {
        const statusHtml = alerta
          ? `<span style="color:#D97706;font-weight:700;font-size:11px;">⚠ ATENÇÃO</span>`
          : `<span style="color:#16A34A;font-weight:700;font-size:11px;">✓ OK</span>`;
        return `
          <tr style="background:#ffffff;">
            <td style="padding:7px 10px;font-size:12.5px;color:#1E293B;border-bottom:1px solid #E5E7EB;">${label}</td>
            <td style="padding:7px 10px;font-size:12.5px;font-weight:700;color:#1E2A4A;text-align:center;border-bottom:1px solid #E5E7EB;">${valor}</td>
            <td style="padding:7px 10px;font-size:12px;color:#6B7280;text-align:center;border-bottom:1px solid #E5E7EB;">${ref}</td>
            <td style="padding:7px 10px;text-align:center;border-bottom:1px solid #E5E7EB;">${statusHtml}</td>
            <td style="padding:7px 10px;font-size:11.5px;color:#374151;border-bottom:1px solid #E5E7EB;">${interp}</td>
          </tr>`;
      };

      const indGroupRow = (label: string) =>
        `<tr style="background:#2D4A8A;"><td colspan="5" style="padding:7px 12px;font-size:12px;font-weight:700;color:#ffffff;letter-spacing:1px;">${label}</td></tr>`;

      const recCard = (num: string, titulo: string, texto: string, prioridade: string) => {
        const cores: Record<string, [string, string]> = {
          'ALTA': ['#FEE2E2', '#DC2626'],
          'MÉDIA': ['#FEF3C7', '#D97706'],
          'BAIXA': ['#DCFCE7', '#16A34A'],
        };
        const [bg, cor] = cores[prioridade] || cores['BAIXA'];
        return `
          <div style="display:flex;gap:16px;margin-bottom:14px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:10px;padding:16px;page-break-inside:avoid;">
            <div style="font-size:28px;font-weight:800;color:#4A7FC1;min-width:40px;text-align:center;line-height:1;">${num}</div>
            <div style="flex:1;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="font-size:13.5px;font-weight:700;color:#1E2A4A;">${titulo}</div>
                <span style="background:${bg};color:${cor};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${prioridade} PRIORIDADE</span>
              </div>
              <div style="font-size:12.5px;color:#374151;line-height:1.7;">${texto}</div>
            </div>
          </div>`;
      };

      const insightCard = (icone: string, titulo: string, texto: string, verde = true) => {
        const [bg, borda] = verde ? ['#F0FDF4', '#16A34A'] : ['#FFFBEB', '#D97706'];
        return `
          <div style="background:${bg};border-left:4px solid ${borda};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:12px;page-break-inside:avoid;">
            <div style="font-size:13.5px;font-weight:700;color:#1E2A4A;margin-bottom:4px;">${icone} ${titulo}</div>
            <div style="font-size:12.5px;color:#374151;line-height:1.7;">${texto}</div>
          </div>`;
      };

      const kpiCard = (label: string, valor: string, sub: string, destaque = false) => {
        const bg = destaque ? 'background:linear-gradient(135deg,#1E2A4A,#2D4A8A);color:white;' : 'background:#F8FAFC;color:#1E2A4A;';
        const subCor = destaque ? 'rgba(255,255,255,0.7)' : '#6B7280';
        return `
          <div style="border:1px solid #E5E7EB;border-radius:10px;padding:14px;text-align:center;${bg}">
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${destaque ? 'rgba(255,255,255,0.7)' : '#6B7280'};margin-bottom:4px;">${label}</div>
            <div style="font-size:17px;font-weight:800;margin-bottom:2px;">${valor}</div>
            <div style="font-size:11px;color:${subCor};">${sub}</div>
          </div>`;
      };

      const rodape = (pagina: number) => `
        <div style="margin-top:30px;padding-top:12px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;font-size:11px;color:#9CA3AF;">
          <span>${paginaRodape}</span>
          <span>Página ${pagina} | Análise gerada pelo ${brandName}</span>
        </div>`;

      const secTitle = (num: string, titulo: string) => `
        <div style="margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #4A7FC1;">
          <div style="font-size:22px;font-weight:800;color:#1E2A4A;">${num}. ${titulo}</div>
        </div>`;

      const avalRow = (dimensao: string, estrelas: string, resumoAval: string) => `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#1E2A4A;font-weight:600;border-bottom:1px solid #E5E7EB;">${dimensao}</td>
          <td style="padding:8px 12px;font-size:13px;color:#F59E0B;border-bottom:1px solid #E5E7EB;">${estrelas}</td>
          <td style="padding:8px 12px;font-size:12.5px;color:#374151;border-bottom:1px solid #E5E7EB;">${resumoAval}</td>
        </tr>`;

      const container = document.createElement('div');
      container.style.cssText = 'background:white;width:794px;font-family:"Segoe UI",Arial,sans-serif;';

      // ── Helpers de compatibilidade (suportam formato antigo string[] e novo objeto estruturado) ──
      const escapeHtml = (s: string) => s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Recebe string[] | { paragrafo1, paragrafo2, ... } | string | undefined → string[]
      const toParagraphs = (val: any): string[] => {
        if (!val) return [];
        if (typeof val === 'string') return [val];
        if (Array.isArray(val)) return val.filter(v => typeof v === 'string' && v).map(String);
        if (typeof val === 'object') {
          const ordered = ['paragrafo1', 'paragrafo2', 'paragrafo3', 'paragrafo4'];
          const out: string[] = [];
          for (const k of ordered) if (typeof val[k] === 'string' && val[k]) out.push(val[k]);
          if (out.length > 0) return out;
          return Object.values(val).filter(v => typeof v === 'string' && v).map(String);
        }
        return [];
      };

      // Recebe string | { titulo, descricao, prioridade?, numero? } → { titulo, descricao, prioridade?, numero? }
      const toItem = (raw: any, fallbackTitle: string): { titulo: string; descricao: string; prioridade?: string; numero?: number } => {
        if (typeof raw === 'string') {
          const txt = raw.trim();
          // tenta separar "Título: descrição" ou "Título. descrição"
          const colonIdx = txt.indexOf(':');
          const dotIdx = txt.indexOf('. ');
          const splitIdx = colonIdx > 0 && (dotIdx < 0 || colonIdx < dotIdx) ? colonIdx : (dotIdx > 0 ? dotIdx + 1 : -1);
          if (splitIdx > 0 && splitIdx < txt.length - 1) {
            const titulo = txt.slice(0, splitIdx).trim();
            const descricao = txt.slice(splitIdx + 1).trim();
            if (titulo && descricao && titulo !== descricao) return { titulo, descricao };
          }
          return { titulo: fallbackTitle, descricao: txt };
        }
        if (raw && typeof raw === 'object') {
          return {
            titulo: (raw.titulo || fallbackTitle).toString().trim(),
            descricao: (raw.descricao || '').toString().trim(),
            prioridade: raw.prioridade ? String(raw.prioridade).replace(/\s*PRIORIDADE\s*$/i, '').toUpperCase() : undefined,
            numero: typeof raw.numero === 'number' ? raw.numero : undefined,
          };
        }
        return { titulo: fallbackTitle, descricao: '' };
      };

      // ── Sumário Executivo ──
      const resumoParas = toParagraphs(pdfAiData?.resumo ?? aiData?.resumo);
      const aiResumoParas = resumoParas.length > 0
        ? resumoParas
        : [`A empresa encerrou o exercício com receita líquida de ${brl(dreData.receitaLiquida)}, ${dreData.lucroLiquido < 0 ? 'prejuízo' : 'lucro líquido'} de ${brl(dreData.lucroLiquido)} e margem de ${pct(dreData.margemLiquida)}.`];

      // ── Análise de Rentabilidade (novo: analiseRentabilidade; legacy: rentabilidade) ──
      const aiRentab = toParagraphs(aiData?.analiseRentabilidade ?? aiData?.rentabilidade);
      const aiRentabFinal = aiRentab.length > 0 ? aiRentab : [
        `Margem bruta de ${pct(dreData.margemBruta)}.`,
        `Despesas operacionais de ${brl(dreData.despesasOperacionais)}.`,
        `Resultado financeiro de ${brl(dreData.resultadoFinanceiro)}.`,
      ];

      // ── Análise Patrimonial (novo: analisePatrimonial; legacy: estrutura) ──
      const aiEstrutura = toParagraphs(aiData?.analisePatrimonial ?? aiData?.estrutura);
      const aiEstruturaFinal = aiEstrutura.length > 0 ? aiEstrutura : [
        `Patrimônio líquido de ${brl(balancoData.patrimonioLiquido)}.`,
      ];

      // Liquidez (campo legacy opcional)
      const aiLiquidez = toParagraphs(aiData?.liquidez);

      // ── Pontos Fortes/Atenção ──
      const fortesRaw = Array.isArray(aiData?.pontosFortes) && aiData.pontosFortes.length > 0
        ? aiData.pontosFortes
        : insights.filter(i => i.includes('✅') || i.includes('💰') || i.includes('🏦'));
      const aiFortes = fortesRaw.slice(0, 4).map((it: any, i: number) => toItem(it, `Ponto Forte ${i + 1}`));

      const atencaoRaw = Array.isArray(aiData?.pontosAtencao) && aiData.pontosAtencao.length > 0
        ? aiData.pontosAtencao
        : insights.filter(i => i.includes('⚠️') || i.includes('⚡'));
      const aiAtencao = atencaoRaw.slice(0, 3).map((it: any, i: number) => toItem(it, `Ponto de Atenção ${i + 1}`));

      // ── Recomendações ──
      const recsFallback = [
        'Monitorar indicadores financeiros periodicamente.',
        'Revisar estrutura de custos operacionais.',
        'Avaliar política de crédito a clientes.',
        'Constituir reserva de contingência.',
        'Acompanhar evolução do resultado financeiro.',
      ];
      const recsRaw = Array.isArray(aiData?.recomendacoes) && aiData.recomendacoes.length > 0
        ? aiData.recomendacoes
        : recsFallback;
      const getPrioridadeIdx = (i: number): string => i === 0 ? 'ALTA' : i <= 2 ? 'MÉDIA' : 'BAIXA';
      const aiRecs = recsRaw.slice(0, 5).map((it: any, i: number) => {
        const item = toItem(it, `Recomendação ${i + 1}`);
        return { ...item, prioridade: item.prioridade || getPrioridadeIdx(i), numero: item.numero || i + 1 };
      });

      // ── Conclusão ──
      const conclParas = toParagraphs(aiData?.conclusao);
      const aiConclusaoParas = conclParas.length > 0 ? conclParas : [
        `A empresa apresenta fundamentos financeiros ${dreData.lucroLiquido > 0 ? 'sólidos' : 'que demandam atenção'} ao término do exercício.`,
      ];

      container.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; }
        .page { width: 794px; padding: 48px 56px; background: white; page-break-after: always; }
        .page:last-child { page-break-after: auto; }
        table { border-collapse: collapse; width: 100%; }
        p { margin-bottom: 12px; font-size: 13px; color: #374151; line-height: 1.75; text-align: justify; }
      </style>

      <div class="page" style="background:linear-gradient(160deg,#1E2A4A 0%,#2D4A8A 55%,#3D5FA8 100%);display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;position:relative;overflow:hidden;min-height:1122px;">
        <div style="position:absolute;top:-80px;right:-80px;width:400px;height:400px;background:radial-gradient(circle,rgba(74,127,193,0.3) 0%,transparent 70%);border-radius:50%;"></div>
        <div style="position:absolute;bottom:-60px;left:-60px;width:300px;height:300px;background:radial-gradient(circle,rgba(99,102,241,0.2) 0%,transparent 70%);border-radius:50%;"></div>
        <div style="position:absolute;top:0;left:0;right:0;height:6px;background:linear-gradient(90deg,#16A34A,#4A7FC1,#7C3AED);"></div>
        <div style="position:relative;z-index:2;">
          ${logoHtml}
          <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);letter-spacing:3px;text-transform:uppercase;margin-bottom:16px;">RELATÓRIO DE ANÁLISE FINANCEIRA</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:40px;">Análise Completa com Inteligência Artificial</div>
          <div style="background:rgba(255,255,255,0.12);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.2);border-radius:16px;padding:28px 56px;margin-bottom:40px;">
            <div style="font-size:24px;font-weight:800;color:white;margin-bottom:6px;">${clientName}</div>
            ${clientCnpj ? `<div style="font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:4px;">CNPJ: ${clientCnpj}</div>` : ''}
            ${clientReg ? `<div style="font-size:12px;color:rgba(255,255,255,0.6);">${clientReg}${clientCnae ? ' | ' + clientCnae : ''}</div>` : ''}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:400px;margin:0 auto 40px;">
            <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:14px;border:1px solid rgba(255,255,255,0.15);">
              <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px;">RECEITA LÍQUIDA</div>
              <div style="font-size:16px;font-weight:800;color:white;">${fmt(dreData.receitaLiquida)}</div>
            </div>
            <div style="background:rgba(22,163,74,0.25);border-radius:10px;padding:14px;border:1px solid rgba(22,163,74,0.4);">
              <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px;">LUCRO LÍQUIDO</div>
              <div style="font-size:16px;font-weight:800;color:#86EFAC;">${fmt(dreData.lucroLiquido)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:14px;border:1px solid rgba(255,255,255,0.15);">
              <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px;">MARGEM LÍQUIDA</div>
              <div style="font-size:16px;font-weight:800;color:white;">${pct(dreData.margemLiquida)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:14px;border:1px solid rgba(255,255,255,0.15);">
              <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px;">LIQUIDEZ CORRENTE</div>
              <div style="font-size:16px;font-weight:800;color:white;">${liqCorrente.toFixed(2)}</div>
            </div>
          </div>
          <div style="font-size:13px;color:rgba(255,255,255,0.5);">Exercício: ${periodo} | Emitido em: ${hoje}</div>
        </div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#16A34A,#4A7FC1,#7C3AED);"></div>
      </div>

      <div class="page">
        ${secTitle('1', 'SUMÁRIO EXECUTIVO')}
        ${aiResumoParas.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
        ${aiLiquidez.length > 0 ? aiLiquidez.map(p => `<p>${escapeHtml(p)}</p>`).join('') : ''}
        ${aiEstruturaFinal.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
        <div style="margin:24px 0;">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">
            ${kpiCard('Receita Líquida', fmt(dreData.receitaLiquida), `Margem ${pct(dreData.margemLiquida)}`, true)}
            ${kpiCard('Lucro Líquido', fmt(dreData.lucroLiquido), dreData.lucroLiquido >= 0 ? 'Resultado positivo' : 'Prejuízo no período')}
            ${kpiCard('EBITDA', fmt(ebitda), `Margem ${pct(margemEbitda)}`)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
            ${kpiCard('Liquidez Corrente', liqCorrente.toFixed(2), liqCorrente >= 2 ? 'Excelente' : liqCorrente >= 1.5 ? 'Adequada' : 'Atenção', true)}
            ${kpiCard('ROE', pct(roe), roe >= 15 ? 'Excelente' : 'Abaixo do ideal')}
            ${kpiCard('PL / Ativo', pct(plPctAtivo), plPctAtivo >= 50 ? 'Capital próprio dominante' : 'Alavancagem moderada')}
          </div>
        </div>
        ${rodape(2)}
      </div>

      <div class="page">
        ${secTitle('2', 'DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE)')}
        <p>A DRE evidencia a geração de valor ao longo do exercício, partindo da receita bruta até o resultado líquido distribuível aos sócios.</p>
        <table style="margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid #E5E7EB;">
          <thead>
            <tr style="background:#1E2A4A;">
              <th style="padding:9px 12px;text-align:left;font-size:12px;color:white;font-weight:700;">DEMONSTRAÇÃO DO RESULTADO</th>
              <th style="padding:9px 12px;text-align:right;font-size:12px;color:white;font-weight:700;">Valor (R$)</th>
              <th style="padding:9px 12px;text-align:right;font-size:12px;color:white;font-weight:700;">% Rec. Líq.</th>
            </tr>
          </thead>
          <tbody>
            ${dreRow('(+) Receita Bruta', dreData.receitaBruta, dreData.receitaLiquida > 0 ? (dreData.receitaBruta / dreData.receitaLiquida) * 100 : 0)}
            ${dreRow('(-) Deduções e Impostos s/ Vendas', dreData.receitaBruta - dreData.receitaLiquida, dreData.receitaLiquida > 0 ? ((dreData.receitaBruta - dreData.receitaLiquida) / dreData.receitaLiquida) * 100 : 0, true)}
            ${dreRow('(=) Receita Líquida', dreData.receitaLiquida, 100, false, false, true)}
            ${dreData.cmv > 0 ? dreRow('(-) CMV / Custo dos Serviços', dreData.cmv, dreData.receitaLiquida > 0 ? (dreData.cmv / dreData.receitaLiquida) * 100 : 0, true) : ''}
            ${dreRow('(=) Lucro Bruto', dreData.lucroBruto, dreData.receitaLiquida > 0 ? (dreData.lucroBruto / dreData.receitaLiquida) * 100 : 0, false, false, true)}
            ${dreRow('(-) Despesas Operacionais', dreData.despesasOperacionais, dreData.receitaLiquida > 0 ? (dreData.despesasOperacionais / dreData.receitaLiquida) * 100 : 0, true)}
            ${dreRow('(=) Lucro Operacional (EBIT)', dreData.lucroOperacional, dreData.receitaLiquida > 0 ? (dreData.lucroOperacional / dreData.receitaLiquida) * 100 : 0, false, false, true)}
            ${dreRow('(-) Resultado Financeiro Líquido', dreData.resultadoFinanceiro, dreData.receitaLiquida > 0 ? (dreData.resultadoFinanceiro / dreData.receitaLiquida) * 100 : 0, dreData.resultadoFinanceiro < 0)}
            ${ebitda > 0 ? dreRow('(=) EBITDA', ebitda, dreData.receitaLiquida > 0 ? (ebitda / dreData.receitaLiquida) * 100 : 0, false, false, true) : ''}
            ${dreData.contribuicaoSocial > 0 ? dreRow('(-) Contribuição Social (CSLL)', dreData.contribuicaoSocial, dreData.receitaLiquida > 0 ? (dreData.contribuicaoSocial / dreData.receitaLiquida) * 100 : 0, true) : ''}
            ${dreRow('(=) LUCRO LÍQUIDO DO EXERCÍCIO', dreData.lucroLiquido, dreData.receitaLiquida > 0 ? (dreData.lucroLiquido / dreData.receitaLiquida) * 100 : 0, dreData.lucroLiquido < 0, true)}
          </tbody>
        </table>
        ${chartDRE || chartMarg ? `
        <div style="display:flex;gap:16px;margin-bottom:20px;justify-content:center;align-items:flex-start;">
          ${chartDRE}
          ${chartMarg}
        </div>` : ''}
        <div style="margin-top:16px;">
          <div style="font-size:14px;font-weight:700;color:#2D4A8A;margin-bottom:8px;">2.1 Análise de Rentabilidade</div>
          ${aiRentab.map(p => `<p>${p}</p>`).join('')}
        </div>
        ${rodape(3)}
      </div>

      <div class="page">
        ${secTitle('3', 'BALANÇO PATRIMONIAL')}
        <p>O balanço patrimonial fotografa a posição financeira da empresa, demonstrando a composição dos recursos e suas fontes de financiamento.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <table style="border-radius:8px;overflow:hidden;border:1px solid #E5E7EB;">
            <thead>
              <tr style="background:#1E2A4A;">
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:white;font-weight:700;">ATIVO</th>
                <th style="padding:8px 12px;text-align:right;font-size:12px;color:white;font-weight:700;">Valor</th>
                <th style="padding:8px 12px;text-align:right;font-size:12px;color:white;font-weight:700;">%</th>
              </tr>
            </thead>
            <tbody>
              ${bpRow('ATIVO CIRCULANTE', balancoData.ativoCirculante, balancoData.ativoTotal > 0 ? (balancoData.ativoCirculante / balancoData.ativoTotal) * 100 : 0)}
              ${bpRow('ATIVO NÃO CIRCULANTE', balancoData.ativoNaoCirculante, balancoData.ativoTotal > 0 ? (balancoData.ativoNaoCirculante / balancoData.ativoTotal) * 100 : 0)}
              ${bpRow('ATIVO TOTAL', balancoData.ativoTotal, 100, false, true)}
            </tbody>
          </table>
          <table style="border-radius:8px;overflow:hidden;border:1px solid #E5E7EB;">
            <thead>
              <tr style="background:#2D4A8A;">
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:white;font-weight:700;">PASSIVO + PL</th>
                <th style="padding:8px 12px;text-align:right;font-size:12px;color:white;font-weight:700;">Valor</th>
                <th style="padding:8px 12px;text-align:right;font-size:12px;color:white;font-weight:700;">%</th>
              </tr>
            </thead>
            <tbody>
              ${bpRow('PASSIVO CIRCULANTE', balancoData.passivoCirculante, balancoData.ativoTotal > 0 ? (balancoData.passivoCirculante / balancoData.ativoTotal) * 100 : 0)}
              ${bpRow('PASSIVO NÃO CIRCULANTE', balancoData.passivoNaoCirculante, balancoData.ativoTotal > 0 ? (balancoData.passivoNaoCirculante / balancoData.ativoTotal) * 100 : 0)}
              ${bpRow(balancoData.patrimonioLiquido < 0 ? 'PATRIMÔNIO LÍQUIDO (Passivo a Descoberto)' : 'PATRIMÔNIO LÍQUIDO', balancoData.patrimonioLiquido, balancoData.ativoTotal > 0 ? (balancoData.patrimonioLiquido / balancoData.ativoTotal) * 100 : 0)}
              ${bpRow('PASSIVO + PL TOTAL', balancoData.ativoTotal, 100, false, true)}
            </tbody>
          </table>
        </div>
        ${chartBP || chartCap ? `
        <div style="display:flex;gap:16px;margin-bottom:20px;justify-content:center;align-items:flex-start;">
          ${chartBP}
          ${chartCap}
        </div>` : ''}
        <div>
          <div style="font-size:14px;font-weight:700;color:#2D4A8A;margin-bottom:8px;">3.1 Análise da Estrutura Patrimonial</div>
          ${aiEstrutura.map(p => `<p>${p}</p>`).join('')}
        </div>
        ${rodape(4)}
      </div>

      <div class="page">
        ${secTitle('4', 'INDICADORES FINANCEIROS')}
        <p>Os indicadores financeiros permitem avaliar objetivamente o desempenho em quatro dimensões: liquidez, endividamento, rentabilidade e atividade.</p>
        <table style="margin-bottom:24px;border-radius:8px;overflow:hidden;border:1px solid #E5E7EB;">
          <thead>
            <tr style="background:#1E2A4A;">
              <th style="padding:8px 10px;text-align:left;font-size:12px;color:white;font-weight:700;">INDICADOR</th>
              <th style="padding:8px 10px;text-align:center;font-size:12px;color:white;font-weight:700;">VALOR</th>
              <th style="padding:8px 10px;text-align:center;font-size:12px;color:white;font-weight:700;">REFERÊNCIA</th>
              <th style="padding:8px 10px;text-align:center;font-size:12px;color:white;font-weight:700;">STATUS</th>
              <th style="padding:8px 10px;text-align:left;font-size:12px;color:white;font-weight:700;">INTERPRETAÇÃO</th>
            </tr>
          </thead>
          <tbody>
            ${indGroupRow('LIQUIDEZ')}
            ${indRow('Liquidez Corrente', liqCorrente.toFixed(2), '> 1,5', liqCorrente >= 1.5, `Para cada R$ 1 de dívida CP, há R$ ${liqCorrente.toFixed(2)} em ativos`, liqCorrente < 1.5)}
            ${indRow('Liquidez Seca', liqSeca.toFixed(2), '> 1,0', liqSeca >= 1, 'Cobertura do PC sem depender de estoques', liqSeca < 1)}
            ${indRow('Liquidez Geral', liqGeral.toFixed(2), '> 1,0', liqGeral >= 1, 'Ativos realizáveis cobrem o passivo exigível', liqGeral < 1)}
            ${indGroupRow('ENDIVIDAMENTO')}
            ${indRow('Endividamento Geral', pct(endivGeral), '< 50%', endivGeral <= 50, `${(100 - endivGeral).toFixed(1)}% do ativo financiado por capital próprio`, endivGeral > 50)}
            ${indRow('Concentração CP', pct(endivCP), '< 60%', endivCP <= 60, 'Proporção das dívidas que vencem no curto prazo', endivCP > 60)}
            ${indGroupRow('RENTABILIDADE')}
            ${indRow('ROE', pct(roe), '> 15%', roe >= 15, 'Retorno sobre o capital dos sócios', roe < 15)}
            ${indRow('ROA', pct(roa), '> 8%', roa >= 8, 'Retorno líquido sobre os ativos totais', roa < 8)}
            ${indRow('Margem EBITDA', pct(margemEbitda), '> 15%', margemEbitda >= 15, 'Geração de caixa operacional sobre a receita', margemEbitda < 15)}
            ${indGroupRow('ATIVIDADE')}
            ${indRow('Giro do Ativo', `${giroAtivo.toFixed(2)}x`, '> 1,0x', giroAtivo >= 1, 'Eficiência dos ativos na geração de receita', giroAtivo < 1)}
          </tbody>
        </table>
        ${rodape(5)}
      </div>

      <div class="page">
        ${secTitle('5', 'PONTOS FORTES E PONTOS DE ATENÇÃO')}
        <div style="font-size:15px;font-weight:700;color:#16A34A;margin-bottom:12px;">✅ Pontos Fortes</div>
        ${aiFortes.map((p) => insightCard('●', escapeHtml(p.titulo), escapeHtml(p.descricao || p.titulo), true)).join('')}
        <div style="font-size:15px;font-weight:700;color:#D97706;margin:20px 0 12px;">⚠️ Pontos de Atenção</div>
        ${aiAtencao.map((p) => insightCard('▲', escapeHtml(p.titulo), escapeHtml(p.descricao || p.titulo), false)).join('')}
        ${rodape(6)}
      </div>

      <div class="page">
        ${secTitle('6', 'RECOMENDAÇÕES ESTRATÉGICAS')}
        <p style="margin-bottom:20px;">Com base na análise dos demonstrativos financeiros, apresentamos as principais recomendações para otimização do desempenho e mitigação de riscos no próximo exercício:</p>
        ${aiRecs.map((rec) => {
          const num = String(rec.numero).padStart(2, '0');
          return recCard(num, escapeHtml(rec.titulo), escapeHtml(rec.descricao || rec.titulo), rec.prioridade || 'BAIXA');
        }).join('')}
        ${rodape(7)}
      </div>

      <div class="page">
        ${secTitle('7', 'CONCLUSÃO')}
        ${aiConclusaoParas.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
        <p>A saúde financeira é evidenciada pela ${liqCorrente >= 1.5 ? 'excelente' : 'adequada'} liquidez (corrente ${liqCorrente.toFixed(2)}) e pelo ${endivGeral <= 50 ? 'baixo endividamento' : 'nível de endividamento'} de ${pct(endivGeral)}. O patrimônio líquido de ${brl(Math.abs(balancoData.patrimonioLiquido))} representa ${pct(plPctAtivo)} do ativo total.</p>
        <p>Para o próximo exercício, recomenda-se acompanhar de perto os pontos de atenção identificados e implementar as recomendações estratégicas apresentadas neste relatório.</p>
        <div style="margin:24px 0;">
          <div style="font-size:14px;font-weight:700;color:#1E2A4A;margin-bottom:12px;">Avaliação Geral por Dimensão</div>
          <table style="border-radius:8px;overflow:hidden;border:1px solid #E5E7EB;">
            <thead>
              <tr style="background:#1E2A4A;">
                <th style="padding:9px 12px;text-align:left;font-size:12px;color:white;">DIMENSÃO</th>
                <th style="padding:9px 12px;text-align:left;font-size:12px;color:white;">AVALIAÇÃO</th>
                <th style="padding:9px 12px;text-align:left;font-size:12px;color:white;">RESUMO</th>
              </tr>
            </thead>
            <tbody>
              ${avalRow('Rentabilidade',
                dreData.margemLiquida >= 15 ? '★★★★★ EXCELENTE' : dreData.margemLiquida >= 5 ? '★★★★☆ BOA' : '★★★☆☆ REGULAR',
                `Margem líquida ${pct(dreData.margemLiquida)} | ROE ${pct(roe)}`)}
              ${avalRow('Liquidez',
                liqCorrente >= 2 ? '★★★★★ EXCELENTE' : liqCorrente >= 1.5 ? '★★★★☆ BOA' : '★★★☆☆ REGULAR',
                `LC ${liqCorrente.toFixed(2)} | LS ${liqSeca.toFixed(2)}`)}
              ${avalRow('Endividamento',
                endivGeral <= 30 ? '★★★★★ BAIXO' : endivGeral <= 50 ? '★★★★☆ ADEQUADO' : '★★★☆☆ ELEVADO',
                `${pct(endivGeral)} — ${pct(endivCP)} concentrado no CP`)}
              ${avalRow('Atividade',
                giroAtivo >= 1.5 ? '★★★★★ EFICIENTE' : giroAtivo >= 1 ? '★★★★☆ BOA' : '★★★☆☆ REGULAR',
                `Giro do ativo ${giroAtivo.toFixed(2)}x`)}
              ${avalRow('Saúde Geral',
                dreData.lucroLiquido > 0 && liqCorrente >= 1.5 && endivGeral <= 60 ? '★★★★★ SÓLIDA' : '★★★★☆ ADEQUADA',
                dreData.lucroLiquido > 0 ? 'Empresa posicionada para crescimento' : 'Necessita atenção ao resultado')}
            </tbody>
          </table>
        </div>
        <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;padding:14px;margin-top:20px;">
          <p style="margin:0;font-size:11.5px;color:#6B7280;text-align:center;font-style:italic;">
            Este relatório foi gerado automaticamente pelo sistema ${brandName} com base nos demonstrativos contábeis importados.
            As análises e recomendações têm caráter informativo e devem ser validadas pelo contador responsável.
          </p>
        </div>
        ${rodape(8)}
      </div>
      `;

      document.body.appendChild(container);

      const opt = {
        margin: 0,
        filename: `relatorio-${clientName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.97 },
        html2canvas: { scale: 2, useCORS: true, logging: false, width: 794, windowWidth: 794 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
        pagebreak: { mode: ['css', 'legacy'] },
      };

      await html2pdf().set(opt).from(container).save();
      document.body.removeChild(container);

    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setIsExporting(false);
      setIsFetchingPdfAi(false);
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

      <AppHeader />

      <main className="relative z-10 container mx-auto px-6 pt-24 pb-12">
        {/* Header */}
        <div className="max-w-4xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
            <span className="text-sm text-green-400 font-medium">✓ Análise Concluída</span>
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
          <>
            <DashboardBalancete
              entries={balanceteEntries}
              previousPeriods={previousPeriods.map((p) => ({ ano: p.ano, entries: p.entries }))}
              dreReceitaBruta={dreData?.receitaBruta}
              dreCMV={dreData?.cmv}
            />

            {/* Análise Vertical e Horizontal */}
            <section className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-2xl font-bold flex items-center gap-3">
                  <BarChart3 className="w-6 h-6 text-primary" />
                  Análise Comparativa (AV / AH)
                </h2>
                <Button variant="neon-outline" onClick={() => setShowHistoricoModal(true)}>
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Adicionar Exercício Anterior
                </Button>
              </div>

              {previousPeriods.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {previousPeriods.map((p, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary font-medium"
                      >
                        {p.ano} ({p.entries.length} contas)
                        <button
                          onClick={() => setPreviousPeriods((prev) => prev.filter((_, idx) => idx !== i))}
                          className="ml-1 text-primary/60 hover:text-primary"
                          title="Remover"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <BalanceteComparativo
                    currentEntries={balanceteEntries}
                    currentPeriodo={balancetePeriodo}
                    previousPeriods={previousPeriods}
                  />
                </>
              ) : (
                <div className="glass-card p-8 text-center border-2 border-dashed border-border/50">
                  <BarChart3 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground mb-2">
                    Importe balancetes de exercícios anteriores para gerar a tabela comparativa com Análise Vertical e
                    Horizontal.
                  </p>
                  <Button variant="outline" onClick={() => setShowHistoricoModal(true)} className="mt-2">
                    <CalendarDays className="w-4 h-4 mr-2" />
                    Adicionar Exercício Anterior
                  </Button>
                </div>
              )}
            </section>
          </>
        )}

        {/* Faturamento Analysis Section */}
        {faturamentoData.length > 0 && (
          <FaturamentoAnalysis data={faturamentoData} />
        )}

        {/* XLS Validation Mode */}
        {validationRows.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-bold flex items-center gap-3">
                <FileSearch className="w-6 h-6 text-primary" />
                Validação XLS
              </h2>
              <Button variant="outline" size="sm" onClick={() => setShowValidation(!showValidation)}>
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
              <h3 className="font-display text-xl font-bold mb-3">🤖 Análise Inteligente</h3>
              <p className="text-muted-foreground mb-6 text-sm">
                Gere uma análise detalhada com insights estratégicos, pontos de atenção e recomendações personalizadas.
              </p>
              <Button variant="hero" size="lg" onClick={() => setShowAIAnalysis(true)}>
                <Sparkles className="w-5 h-5 mr-2" />
                Gerar Análise
              </Button>
            </div>

            {/* AI Presentation Card */}
            <div className="glass-card p-8 text-center bg-gradient-to-br from-secondary/5 to-secondary/10 border-secondary/20">
              <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto mb-4">
                <Presentation className="w-8 h-8 text-secondary" />
              </div>
              <h3 className="font-display text-xl font-bold mb-3">📊 Apresentação Executiva</h3>
              <p className="text-muted-foreground mb-6 text-sm">
                Crie slides profissionais com a situação financeira da empresa, indicadores chave e recomendações
                estratégicas.
              </p>
              <Button variant="neon" size="lg" onClick={() => setShowAIPresentation(true)}>
                <Presentation className="w-5 h-5 mr-2" />
                Gerar Apresentação
              </Button>
            </div>
          </div>
        </section>

        {/* Insights Section */}
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold mb-6">💡 Insights Automáticos</h2>
          <div className="glass-card p-6 space-y-4">
            {insights.map((insight, index) => (
              <div key={index} className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-foreground">{insight}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Financial Chat Section */}
        {dreData && balancoData && (
          <section className="mb-12">
            <h2 className="font-display text-2xl font-bold mb-6">🤖 Simulador de Cenários</h2>
            <FinancialChatBox
              financialContext={{
                dre: dreData,
                balanco: balancoData,
                dreEntries: dreClassifiedEntries.map((e) => ({
                  descricao: e.descricao,
                  valor: e.valor,
                  grupo: e.grupo,
                })),
                balancoEntries: rawBalancoEntries.map((e) => ({
                  conta: e.conta,
                  valor: e.valor,
                  tipo: e.tipo,
                  hierarchy: e.hierarchy || "",
                })),
                empresa: selectedEmpresa
                  ? {
                      nome: selectedEmpresa.nome,
                      cnpj: selectedEmpresa.cnpj,
                      cnae: selectedEmpresa.cnae,
                      regime_tributario: selectedEmpresa.regime_tributario,
                      contexto: selectedEmpresa.contexto,
                    }
                  : undefined,
              }}
            />
          </section>
        )}

        {/* Export PDF Button */}
        <section className="mb-12">
          <div className="glass-card p-8 text-center">
            <h3 className="font-display text-xl font-bold mb-3">📄 Exportar Relatório</h3>
            <p className="text-muted-foreground mb-6">
              Gere um PDF profissional com todos os dados desta análise para enviar aos seus clientes.
            </p>
            <Button variant="hero" size="xl" onClick={handleExportPDF} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {isFetchingPdfAi ? 'Consultando IA...' : 'Gerando PDF...'}
                </>
              ) : (
                <>
                  <FileDown className="w-5 h-5 mr-2" />
                  Exportar Relatório Completo (PDF)
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
          <p className="text-muted-foreground mb-4">Deseja adicionar arquivos ou iniciar nova análise?</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Button variant="outline" size="xl" onClick={() => setShowAddFiles(true)}>
              <UploadCloud className="w-5 h-5 mr-2" />
              Adicionar Novos Arquivos
            </Button>
            <Link to="/upload">
              <Button variant="hero" size="xl">
                <RefreshCw className="w-5 h-5 mr-2" />
                Nova Análise
              </Button>
            </Link>
          </div>
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
        empresa={selectedEmpresa ? {
          nome: selectedEmpresa.nome,
          cnpj: selectedEmpresa.cnpj,
          cnae: selectedEmpresa.cnae,
          regime_tributario: selectedEmpresa.regime_tributario,
          contexto: selectedEmpresa.contexto,
        } : undefined}
      />

      {/* AI Presentation Dialog */}
      <AIPresentationDialog
        open={showAIPresentation}
        onOpenChange={setShowAIPresentation}
        dreData={dreData}
        balancoData={balancoData}
        empresaNome={selectedEmpresa?.nome || "Empresa"}
        empresaCnpj={selectedEmpresa?.cnpj}
        empresaCnae={selectedEmpresa?.cnae}
        empresaRegimeTributario={selectedEmpresa?.regime_tributario}
        empresaContexto={selectedEmpresa?.contexto || undefined}
        branding={branding}
      />

      {/* Balancete Historico Modal */}
      <BalanceteHistoricoModal
        open={showHistoricoModal}
        onOpenChange={setShowHistoricoModal}
        currentPeriodo={balancetePeriodo}
        existingPeriods={previousPeriods.map((p) => p.ano)}
        onPeriodAdded={(period) => setPreviousPeriods((prev) => [...prev, period])}
      />

      {/* Add Files Dialog */}
      {empresaIdParam && (
        <AddFilesDialog
          open={showAddFiles}
          onOpenChange={setShowAddFiles}
          empresaId={empresaIdParam}
          importedFiles={[
            ...(dreData ? [{ tipo: "DRE", label: "DRE" }] : []),
            ...(balancoData ? [{ tipo: "BALANCO_PATRIMONIAL", label: "Balanço Patrimonial" }] : []),
            ...(balanceteEntries.length > 0 ? [{ tipo: "BALANCETE", label: "Balancete" }] : []),
            ...(faturamentoData.length > 0 ? [{ tipo: "FATURAMENTO", label: "Relatório de Faturamento" }] : []),
          ]}
          onProcessingComplete={() => {
            setLoading(true);
            loadData();
          }}
        />
      )}
    </div>
  );
};

export default Resultado;
