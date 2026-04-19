import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  PiggyBank,
  Receipt,
  Calculator,
  Scale,
  Building,
  Landmark,
  Percent,
  ShieldCheck,
  Activity,
  Target,
  BarChart3,
  FileSearch,
  
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ProgressBar";
import { IndicatorCard, IndicatorSection, type IndicatorConfig, type AccountDetail } from "@/components/IndicatorCard";
import {
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, ReferenceLine, LabelList,
} from "recharts";

interface DREClassifiedEntry {
  descricao: string;
  valor: number;
  valorAnterior: number | null;
  grupo: string;
  isExplicit: boolean;
  motivo: string;
  insideCMVBlock?: boolean;
}

interface CalculatedDRE {
  receitaBruta: number;
  receitaBrutaOrigem: string;
  receitaLiquida: number;
  receitaLiquidaOrigem: string;
  cmv: number;
  cmvOrigem: string;
  lucroBruto: number;
  lucroBrutoOrigem: string;
  despesasOperacionais: number;
  despesasOperacionaisOrigem: string;
  lucroOperacional: number;
  lucroOperacionalOrigem: string;
  resultadoFinanceiro: number;
  resultadoFinanceiroOrigem: string;
  contribuicaoSocial: number;
  contribuicaoSocialOrigem: string;
  lucroLiquido: number;
  lucroLiquidoOrigem: string;
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

interface BalancoEntry {
  conta: string;
  tipo: string;
  valor: number;
  valor_anterior: number | null;
  hierarchy: string;
  natureza_conta?: 'sintetica' | 'analitica';
  detection_motivo?: string;
  is_redutora?: boolean;
}

interface DashboardIndicadoresProps {
  dreData: CalculatedDRE;
  balancoData: CalculatedBalanco;
  dreClassifiedEntries: DREClassifiedEntry[];
  rawBalancoEntries: BalancoEntry[];
  getDREGroupColor: (grupo: string) => string;
  getDREGroupLabel: (grupo: string) => string;
  showDreDebug: boolean;
  setShowDreDebug: (v: boolean) => void;
}

function getAccountsForGroup(entries: DREClassifiedEntry[], grupo: string): AccountDetail[] {
  return entries
    .filter((e) => e.grupo === grupo)
    .map((e) => ({
      descricao: e.descricao,
      valor: e.valor,
      motivo: e.motivo,
    }));
}

export function DashboardIndicadores({
  dreData,
  balancoData,
  dreClassifiedEntries,
  rawBalancoEntries,
  getDREGroupColor,
  getDREGroupLabel,
  showDreDebug,
  setShowDreDebug,
}: DashboardIndicadoresProps) {
  // Compute EBITDA: Lucro Operacional + Depreciação/Amortização
  const depreciacao = useMemo(() => {
    return dreClassifiedEntries
      .filter((e) => {
        const desc = e.descricao.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return desc.includes("DEPRECIACAO") || desc.includes("AMORTIZACAO");
      })
      .reduce((sum, e) => sum + Math.abs(e.valor), 0);
  }, [dreClassifiedEntries]);

  const ebitda = dreData.lucroOperacional + depreciacao;
  const margemEbitda = dreData.receitaLiquida > 0 ? (ebitda / dreData.receitaLiquida) * 100 : 0;

  // Balanço indicators
  const liquidezCorrente = balancoData.passivoCirculante > 0
    ? balancoData.ativoCirculante / balancoData.passivoCirculante
    : 0;

  // Liquidez seca: (AC - Estoques) / PC
  // Strategy: find the highest-level synthetic "ESTOQUES" entry (the group total).
  // If not found, fall back to summing analytic entries that match estoque keywords.
  const estoques = useMemo(() => {
    const norm = (s: string) => s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    // Try to find the synthetic total first (the group entry "ESTOQUES")
    const syntheticEstoque = rawBalancoEntries.find((e) => {
      const n = norm(e.conta);
      return (n === "ESTOQUES" || n === "ESTOQUE") && e.natureza_conta === 'sintetica';
    });
    if (syntheticEstoque) return Math.abs(syntheticEstoque.valor);
    // Fallback: sum analytic entries matching estoque/mercadoria keywords
    return rawBalancoEntries
      .filter((e) => {
        if (e.natureza_conta === 'sintetica') return false;
        const conta = norm(e.conta);
        return conta.includes("ESTOQUE") || conta.includes("MERCADORIA") || conta.includes("PRODUTO");
      })
      .reduce((sum, e) => sum + Math.abs(e.valor), 0);
  }, [rawBalancoEntries]);

  const liquidezSeca = balancoData.passivoCirculante > 0
    ? (balancoData.ativoCirculante - estoques) / balancoData.passivoCirculante
    : 0;

  const endividamentoGeral = balancoData.ativoTotal > 0
    ? ((balancoData.passivoCirculante + balancoData.passivoNaoCirculante) / balancoData.ativoTotal) * 100
    : 0;

  const composicaoEndividamento = (balancoData.passivoCirculante + balancoData.passivoNaoCirculante) > 0
    ? (balancoData.passivoCirculante / (balancoData.passivoCirculante + balancoData.passivoNaoCirculante)) * 100
    : 0;

  // Lucro líquido negativo (prejuízo) é refletido nas fórmulas derivadas
  const roe = balancoData.patrimonioLiquido > 0
    ? (dreData.lucroLiquido / balancoData.patrimonioLiquido) * 100
    : 0;

  const roa = balancoData.ativoTotal > 0
    ? (dreData.lucroLiquido / balancoData.ativoTotal) * 100
    : 0;

  // DRE Indicators
  const dreIndicators: IndicatorConfig[] = [
    {
      title: "Receita Bruta",
      value: dreData.receitaBruta,
      format: "currency",
      icon: DollarSign,
      variant: "highlight",
      formula: "Σ Contas de Receita Bruta",
      formulaDescription: "Soma de todas as receitas operacionais brutas (vendas, serviços, faturamento).",
      accounts: getAccountsForGroup(dreClassifiedEntries, "receita_bruta"),
      subtitle: dreData.receitaBrutaOrigem === "linha_explicita" ? "Linha explícita" : "Soma de contas",
    },
    {
      title: "Receita Líquida",
      value: dreData.receitaLiquida,
      format: "currency",
      icon: Wallet,
      formula: "Receita Bruta − Deduções",
      formulaDescription: "Receita bruta menos impostos sobre vendas, devoluções e abatimentos.",
      accounts: getAccountsForGroup(dreClassifiedEntries, "receita_liquida"),
      subtitle: dreData.receitaLiquidaOrigem === "linha_explicita" ? "Linha explícita" : "Calculada",
    },
    {
      title: "CMV / Custos",
      value: dreData.cmv,
      format: "currency",
      icon: Receipt,
      formula: "Σ Custos das Mercadorias/Serviços",
      formulaDescription: "Custo das mercadorias vendidas, produtos vendidos ou serviços prestados.",
      accounts: getAccountsForGroup(dreClassifiedEntries, "cmv"),
      trend: dreData.cmv < 0 ? "down" : "neutral",
    },
    {
      title: "Lucro Bruto",
      value: dreData.lucroBruto,
      format: "currency",
      icon: PiggyBank,
      variant: "accent",
      formula: "Receita Líquida − CMV",
      formulaDescription: "Resultado da receita líquida deduzida dos custos diretos de produção/aquisição.",
      accounts: getAccountsForGroup(dreClassifiedEntries, "lucro_bruto"),
    },
    {
      title: "EBITDA",
      value: ebitda,
      format: "currency",
      icon: BarChart3,
      variant: "highlight",
      formula: "Lucro Operacional + Depreciação + Amortização",
      formulaDescription: "Lucro antes de juros, impostos, depreciação e amortização. Mede a geração de caixa operacional.",
      accounts: [
        { descricao: "Lucro Operacional", valor: dreData.lucroOperacional, motivo: "Base do EBITDA" },
        ...dreClassifiedEntries
          .filter((e) => {
            const d = e.descricao.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return d.includes("DEPRECIACAO") || d.includes("AMORTIZACAO");
          })
          .map((e) => ({ descricao: e.descricao, valor: Math.abs(e.valor), motivo: "Adicionado de volta ao EBITDA" })),
      ],
      subtitle: `Margem EBITDA: ${margemEbitda.toFixed(1)}%`,
    },
    {
      title: "Despesas Operacionais",
      value: dreData.despesasOperacionais,
      format: "currency",
      icon: Calculator,
      formula: "Σ Despesas Administrativas + Trabalhistas + Gerais",
      formulaDescription: "Total de despesas com a operação: salários, aluguel, materiais, etc.",
      accounts: getAccountsForGroup(dreClassifiedEntries, "despesas_operacionais"),
    },
    {
      title: "Lucro Operacional",
      value: dreData.lucroOperacional,
      format: "currency",
      icon: TrendingUp,
      formula: "Lucro Bruto − Despesas Operacionais",
      formulaDescription: "Resultado das operações antes de receitas/despesas financeiras e impostos.",
      accounts: getAccountsForGroup(dreClassifiedEntries, "lucro_operacional"),
    },
    {
      title: "Lucro Líquido",
      value: dreData.lucroLiquido,
      format: "currency",
      icon: Target,
      variant: dreData.lucroLiquido >= 0 ? "success" : "danger",
      formula: "Lucro Operacional ± Resultado Financeiro − IR − CSLL",
      formulaDescription: "Resultado final após todas as deduções: financeiras, tributárias e não operacionais.",
      accounts: getAccountsForGroup(dreClassifiedEntries, "lucro_liquido"),
      trend: dreData.lucroLiquido >= 0 ? "up" : "down",
    },
  ];

  // Margin indicators
  const marginIndicators: IndicatorConfig[] = [
    {
      title: "Margem Bruta",
      value: dreData.margemBruta,
      format: "percentage",
      icon: Percent,
      variant: dreData.margemBruta >= 30 ? "success" : dreData.margemBruta >= 15 ? "warning" : "danger",
      formula: "(Lucro Bruto ÷ Receita Líquida) × 100",
      formulaDescription: "Percentual de lucro após custos diretos. Indica eficiência na produção/aquisição.",
      accounts: [
        { descricao: "Lucro Bruto", valor: dreData.lucroBruto, motivo: "Numerador" },
        { descricao: "Receita Líquida", valor: dreData.receitaLiquida, motivo: "Denominador" },
      ],
      trend: dreData.margemBruta >= 30 ? "up" : dreData.margemBruta < 10 ? "down" : "neutral",
    },
    {
      title: "Margem Operacional",
      value: dreData.margemOperacional,
      format: "percentage",
      icon: Percent,
      variant: dreData.margemOperacional >= 15 ? "success" : dreData.margemOperacional >= 5 ? "warning" : "danger",
      formula: "(Lucro Operacional ÷ Receita Líquida) × 100",
      formulaDescription: "Eficiência operacional: quanto da receita sobra após custos e despesas operacionais.",
      accounts: [
        { descricao: "Lucro Operacional", valor: dreData.lucroOperacional, motivo: "Numerador" },
        { descricao: "Receita Líquida", valor: dreData.receitaLiquida, motivo: "Denominador" },
      ],
    },
    {
      title: "Margem Líquida",
      value: dreData.margemLiquida,
      format: "percentage",
      icon: Percent,
      variant: dreData.margemLiquida < 0 ? "danger" : dreData.margemLiquida >= 10 ? "success" : dreData.margemLiquida >= 3 ? "warning" : "danger",
      formula: "(Lucro Líquido ÷ Receita Líquida) × 100",
      formulaDescription: "Percentual final que efetivamente vira lucro para os sócios. Valores negativos indicam prejuízo líquido.",
      accounts: [
        { descricao: "Lucro Líquido", valor: dreData.lucroLiquido, motivo: "Numerador" },
        { descricao: "Receita Líquida", valor: dreData.receitaLiquida, motivo: "Denominador" },
      ],
      trend: dreData.margemLiquida < 0 ? "down" : dreData.margemLiquida >= 10 ? "up" : dreData.margemLiquida < 3 ? "down" : "neutral",
    },
    {
      title: "Margem EBITDA",
      value: margemEbitda,
      format: "percentage",
      icon: BarChart3,
      variant: margemEbitda >= 20 ? "success" : margemEbitda >= 10 ? "warning" : "danger",
      formula: "(EBITDA ÷ Receita Líquida) × 100",
      formulaDescription: "Capacidade de geração de caixa operacional em relação à receita.",
      accounts: [
        { descricao: "EBITDA", valor: ebitda, motivo: "Numerador" },
        { descricao: "Receita Líquida", valor: dreData.receitaLiquida, motivo: "Denominador" },
      ],
    },
  ];

  // Balanço indicators
  // Helper to detect redutora entries in balanço
  const isBalancoRedutora = (entry: BalancoEntry): boolean => {
    const norm = entry.conta.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return entry.is_redutora || norm.startsWith('(-)') ||
      /DEPRECIA/.test(norm) || /DEPREC\./.test(norm) ||
      /AMORTIZA/.test(norm) || /EXAUSTAO/.test(norm) ||
      /PROVISAO.*DEVED/.test(norm) || /PDD/.test(norm);
  };

  // Build detailed analytic accounts for Ativo Total drill-down
  const ativoAnalyticAccounts = useMemo((): AccountDetail[] => {
    const ativoEntries = rawBalancoEntries.filter(
      (e) => e.tipo.startsWith('ATIVO') || e.tipo === 'IMOBILIZADO' || e.tipo === 'INTANGIVEL' || e.tipo === 'INVESTIMENTO'
    );

    // Separate circulante and não circulante
    const circulanteEntries = ativoEntries.filter(
      (e) => e.tipo === 'ATIVO_CIRCULANTE' || e.tipo === 'ATIVO CIRCULANTE' ||
        (!e.tipo.includes('NAO') && !['IMOBILIZADO', 'INTANGIVEL', 'INVESTIMENTO'].includes(e.tipo) && e.tipo !== 'ATIVO')
    );
    const naoCirculanteEntries = ativoEntries.filter(
      (e) => e.tipo.includes('NAO') || ['IMOBILIZADO', 'INTANGIVEL', 'INVESTIMENTO'].includes(e.tipo)
    );

    const mapEntry = (e: BalancoEntry): AccountDetail => {
      const redutora = isBalancoRedutora(e);
      return {
        descricao: e.conta,
        valor: redutora ? -Math.abs(e.valor) : Math.abs(e.valor),
        motivo: e.natureza_conta === 'sintetica'
          ? `⊞ Totalizador — ${e.tipo}`
          : redutora
            ? 'Conta redutora do ativo — subtraída do total conforme normas contábeis.'
            : e.tipo,
        isSynthetic: e.natureza_conta === 'sintetica',
        isRedutora: redutora,
      };
    };

    const circulanteDetails = circulanteEntries.map(mapEntry);
    const naoCirculanteDetails = naoCirculanteEntries.map(mapEntry);

    if (circulanteDetails.length === 0 && naoCirculanteDetails.length === 0) {
      // Fallback to aggregate values
      return [
        { descricao: "Ativo Circulante", valor: balancoData.ativoCirculante, motivo: "Bens de curto prazo" },
        { descricao: "Ativo Não Circulante", valor: balancoData.ativoNaoCirculante, motivo: "Bens de longo prazo" },
      ];
    }

    return [
      ...circulanteDetails,
      ...(naoCirculanteDetails.length > 0
        ? [{ descricao: "─── Ativo Não Circulante ───", valor: 0, motivo: "" }, ...naoCirculanteDetails]
        : []),
    ];
  }, [rawBalancoEntries, balancoData]);

  const balancoIndicators: IndicatorConfig[] = [
    {
      title: "Ativo Total",
      value: balancoData.ativoTotal,
      format: "currency",
      icon: Building,
      variant: "highlight",
      formula: "Ativo Circulante + Ativo Não Circulante (líquido de redutoras)",
      formulaDescription: "Total de bens e direitos da empresa. A memória de cálculo abaixo detalha as contas analíticas, incluindo imobilizado e suas redutoras (depreciação, amortização).",
      accounts: ativoAnalyticAccounts,
    },
    {
      title: "Passivo Total",
      value: balancoData.passivoTotal,
      format: "currency",
      icon: Scale,
      formula: "Passivo Circulante + Passivo Não Circulante",
      formulaDescription: "Total de obrigações da empresa com terceiros.",
      accounts: [
        { descricao: "Passivo Circulante", valor: balancoData.passivoCirculante, motivo: "Obrigações de curto prazo" },
        { descricao: "Passivo Não Circulante", valor: balancoData.passivoNaoCirculante, motivo: "Obrigações de longo prazo" },
      ],
    },
    {
      title: "Patrimônio Líquido",
      value: balancoData.patrimonioLiquido,
      format: "currency",
      icon: Landmark,
      variant: "accent",
      formula: "Ativo Total − Passivo Total",
      formulaDescription: "Recursos próprios dos sócios investidos na empresa.",
      accounts: [
        { descricao: "Ativo Total", valor: balancoData.ativoTotal, motivo: "Total de bens" },
        { descricao: "Passivo Total", valor: -balancoData.passivoTotal, motivo: "Menos obrigações" },
      ],
    },
  ];

  // Solvência & Rentabilidade indicators
  const solvenciaIndicators: IndicatorConfig[] = [
    {
      title: "Liquidez Corrente",
      value: liquidezCorrente,
      format: "ratio",
      icon: Activity,
      variant: liquidezCorrente >= 1.5 ? "success" : liquidezCorrente >= 1 ? "warning" : "danger",
      formula: "Ativo Circulante ÷ Passivo Circulante",
      formulaDescription: "Capacidade de pagar dívidas de curto prazo. Ideal > 1,5.",
      accounts: [
        { descricao: "Ativo Circulante", valor: balancoData.ativoCirculante, motivo: "Numerador" },
        { descricao: "Passivo Circulante", valor: balancoData.passivoCirculante, motivo: "Denominador" },
      ],
      trend: liquidezCorrente >= 1.5 ? "up" : liquidezCorrente < 1 ? "down" : "neutral",
      subtitle: liquidezCorrente >= 1.5 ? "Saudável" : liquidezCorrente >= 1 ? "Adequada" : "Risco",
      visible: balancoData.passivoCirculante > 0,
    },
    {
      title: "Liquidez Seca",
      value: liquidezSeca,
      format: "ratio",
      icon: ShieldCheck,
      variant: liquidezSeca >= 1 ? "success" : liquidezSeca >= 0.7 ? "warning" : "danger",
      formula: "(Ativo Circulante − Estoques) ÷ Passivo Circulante",
      formulaDescription: "Capacidade de pagamento excluindo estoques (menos líquidos). Ideal > 1.",
      accounts: [
        { descricao: "Ativo Circulante", valor: balancoData.ativoCirculante, motivo: "Base" },
        { descricao: "Estoques (deduzidos)", valor: -estoques, motivo: "Removido por ser menos líquido" },
        { descricao: "Passivo Circulante", valor: balancoData.passivoCirculante, motivo: "Denominador" },
      ],
      visible: balancoData.passivoCirculante > 0,
    },
    {
      title: "Endividamento Geral",
      value: endividamentoGeral,
      format: "percentage",
      icon: TrendingDown,
      variant: endividamentoGeral <= 50 ? "success" : endividamentoGeral <= 70 ? "warning" : "danger",
      formula: "(Passivo Total ÷ Ativo Total) × 100",
      formulaDescription: "Quanto dos ativos é financiado por terceiros. Ideal < 60%.",
      accounts: [
        { descricao: "Passivo Total", valor: balancoData.passivoCirculante + balancoData.passivoNaoCirculante, motivo: "Numerador" },
        { descricao: "Ativo Total", valor: balancoData.ativoTotal, motivo: "Denominador" },
      ],
      trend: endividamentoGeral <= 50 ? "up" : endividamentoGeral > 70 ? "down" : "neutral",
      visible: balancoData.ativoTotal > 0,
    },
    {
      title: "Composição Endividamento",
      value: composicaoEndividamento,
      format: "percentage",
      icon: Scale,
      variant: composicaoEndividamento <= 50 ? "success" : composicaoEndividamento <= 70 ? "warning" : "danger",
      formula: "Passivo Circulante ÷ Passivo Total × 100",
      formulaDescription: "Quanto da dívida vence no curto prazo. Ideal < 50% (dívidas mais longas).",
      accounts: [
        { descricao: "Passivo Circulante", valor: balancoData.passivoCirculante, motivo: "Dívida de curto prazo" },
        { descricao: "Passivo Não Circulante", valor: balancoData.passivoNaoCirculante, motivo: "Dívida de longo prazo" },
      ],
      visible: (balancoData.passivoCirculante + balancoData.passivoNaoCirculante) > 0,
    },
    {
      title: "ROE",
      value: roe,
      format: "percentage",
      icon: Target,
      variant: roe < 0 ? "danger" : roe >= 15 ? "success" : roe >= 5 ? "warning" : "danger",
      formula: "(Lucro Líquido ÷ Patrimônio Líquido) × 100",
      formulaDescription: "Retorno sobre o capital dos sócios. Mede a rentabilidade do investimento próprio.",
      accounts: [
        { descricao: "Lucro Líquido", valor: dreData.lucroLiquido, motivo: "Numerador" },
        { descricao: "Patrimônio Líquido", valor: balancoData.patrimonioLiquido, motivo: "Denominador" },
      ],
      trend: roe >= 15 ? "up" : roe < 5 ? "down" : "neutral",
      visible: balancoData.patrimonioLiquido > 0,
    },
    {
      title: "ROA",
      value: roa,
      format: "percentage",
      icon: Activity,
      variant: roa < 0 ? "danger" : roa >= 8 ? "success" : roa >= 3 ? "warning" : "danger",
      formula: "(Lucro Líquido ÷ Ativo Total) × 100",
      formulaDescription: "Retorno sobre os ativos totais. Eficiência no uso de todos os recursos.",
      accounts: [
        { descricao: "Lucro Líquido", valor: dreData.lucroLiquido, motivo: "Numerador" },
        { descricao: "Ativo Total", valor: balancoData.ativoTotal, motivo: "Denominador" },
      ],
      visible: balancoData.ativoTotal > 0,
    },
  ];

  // ===== Chart Data =====
  const PIE_COLORS = ["hsl(142, 76%, 36%)", "hsl(0, 84%, 60%)", "hsl(47, 96%, 53%)", "hsl(221, 83%, 53%)", "hsl(262, 83%, 58%)"];
  const BALANCE_COLORS = ["hsl(221, 83%, 53%)", "hsl(262, 83%, 58%)"];
  const CAPITAL_COLORS = ["hsl(0, 84%, 60%)", "hsl(47, 96%, 53%)", "hsl(142, 76%, 36%)"];

  // Normaliza para 0-100. Valores negativos mapeiam abaixo de 50 (centro do radar).
  // Range: [-max, +max] -> [0, 100]; zero -> 50.
  const normalize = (v: number, max: number) => {
    const ratio = v / max; // -1..+1 ideal
    return Math.min(Math.max(50 + ratio * 50, 0), 100);
  };

  // ── GRÁFICO 1: Waterfall DRE ──────────────────────────────────────────
  const waterfallDreData = useMemo(() => {
    const rb  = Math.abs(dreData.receitaBruta);
    const ded = Math.abs(dreData.receitaBruta - dreData.receitaLiquida);
    const rl  = Math.abs(dreData.receitaLiquida);
    const cmv = Math.abs(dreData.cmv);
    const lb  = Math.abs(dreData.lucroBruto);
    const do_ = Math.abs(dreData.despesasOperacionais);
    const lo  = Math.abs(dreData.lucroOperacional);
    const rf  = dreData.resultadoFinanceiro;
    const ll  = Math.abs(dreData.lucroLiquido);

    return [
      { name: "Rec. Bruta",   valor: rb,   base: 0,    cor: "#4A7FC1", tipo: "positivo" },
      { name: "Deduções",     valor: ded,  base: rl,   cor: "#EF4444", tipo: "negativo" },
      { name: "Rec. Líquida", valor: rl,   base: 0,    cor: "#6366F1", tipo: "subtotal" },
      { name: "CMV",          valor: cmv,  base: lb,   cor: "#EF4444", tipo: "negativo" },
      { name: "Lucro Bruto",  valor: lb,   base: 0,    cor: "#6366F1", tipo: "subtotal" },
      { name: "Desp. Op.",    valor: do_,  base: lo,   cor: "#F59E0B", tipo: "negativo" },
      { name: "L. Operac.",   valor: lo,   base: 0,    cor: "#6366F1", tipo: "subtotal" },
      { name: "Res. Fin.",    valor: Math.abs(rf), base: rf < 0 ? lo + rf : lo, cor: rf < 0 ? "#EF4444" : "#10B981", tipo: rf < 0 ? "negativo" : "positivo" },
      { name: "L. Líquido",   valor: ll,   base: 0,    cor: "#10B981", tipo: "resultado" },
    ];
  }, [dreData]);

  // ── GRÁFICO 2: Barras Horizontais — Composição das Despesas ──────────
  const despesasBarData = useMemo(() => {
    const total = Math.abs(dreData.cmv) + Math.abs(dreData.despesasOperacionais) + Math.abs(dreData.resultadoFinanceiro);
    if (total === 0) return [];
    const rl = Math.abs(dreData.receitaLiquida) || 1;
    return [
      { name: "CMV",           valor: Math.abs(dreData.cmv),                  pct: (Math.abs(dreData.cmv) / rl) * 100 },
      { name: "Desp. Op.",     valor: Math.abs(dreData.despesasOperacionais), pct: (Math.abs(dreData.despesasOperacionais) / rl) * 100 },
      { name: "Res. Fin.",     valor: Math.abs(dreData.resultadoFinanceiro),  pct: (Math.abs(dreData.resultadoFinanceiro) / rl) * 100 },
      { name: "Lucro Líquido", valor: Math.abs(dreData.lucroLiquido),         pct: (Math.abs(dreData.lucroLiquido) / rl) * 100 },
    ].filter(d => d.valor > 0);
  }, [dreData]);

  // ── GRÁFICO 3: Barras Empilhadas Espelhadas — Balanço Patrimonial ─────
  const balancoEspelhadoData = useMemo(() => [
    {
      grupo: "Ativo",
      "Ativo Circ.":     balancoData.ativoCirculante,
      "Ativo Não Circ.": balancoData.ativoNaoCirculante,
      "Passivo Circ.":   0,
      "Passivo Não Circ.": 0,
      "Patr. Líquido":   0,
    },
    {
      grupo: "Passivo + PL",
      "Ativo Circ.":     0,
      "Ativo Não Circ.": 0,
      "Passivo Circ.":   balancoData.passivoCirculante,
      "Passivo Não Circ.": balancoData.passivoNaoCirculante,
      "Patr. Líquido":   Math.abs(balancoData.patrimonioLiquido),
    },
  ], [balancoData]);

  // ── GRÁFICO 4: Barras Horizontais — Estrutura de Capital (% do Ativo) ─
  const estruturaCapitalData = useMemo(() => {
    const total = balancoData.ativoTotal || 1;
    return [
      { name: "Ativo Circ.",       valor: balancoData.ativoCirculante,             pct: (balancoData.ativoCirculante / total) * 100,             cor: "#4A7FC1" },
      { name: "Ativo Não Circ.",   valor: balancoData.ativoNaoCirculante,          pct: (balancoData.ativoNaoCirculante / total) * 100,          cor: "#6366F1" },
      { name: "Passivo Circ.",     valor: balancoData.passivoCirculante,           pct: (balancoData.passivoCirculante / total) * 100,           cor: "#EF4444" },
      { name: "Passivo Não Circ.", valor: balancoData.passivoNaoCirculante,        pct: (balancoData.passivoNaoCirculante / total) * 100,        cor: "#F59E0B" },
      { name: "Patr. Líquido",     valor: Math.abs(balancoData.patrimonioLiquido), pct: (Math.abs(balancoData.patrimonioLiquido) / total) * 100, cor: "#10B981" },
    ].filter(d => d.valor > 0);
  }, [balancoData]);

  // ── DRILL-DOWN ──────────────────────────────────────────────────────
  type DrillDownItem = {
    titulo: string;
    valor: number;
    percentual: number;
    descricao?: string;
    composicao: { nome: string; valor: number; percentual: number }[];
    scrollTargetId?: string;
  };

  const [selectedItem, setSelectedItem] = useState<DrillDownItem | null>(null);
  const [activeChartKey, setActiveChartKey] = useState<string | null>(null);

  const formatBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const buildComposicaoFromDRE = (grupo: string, totalRef: number) => {
    const accs = dreClassifiedEntries.filter((e) => e.grupo === grupo);
    const total = totalRef || accs.reduce((s, a) => s + Math.abs(a.valor), 0) || 1;
    return accs
      .map((a) => ({
        nome: a.descricao,
        valor: Math.abs(a.valor),
        percentual: (Math.abs(a.valor) / total) * 100,
      }))
      .sort((a, b) => b.valor - a.valor);
  };

  const buildComposicaoFromBalanco = (
    tipoFilter: (e: BalancoEntry) => boolean,
    totalRef: number,
  ) => {
    const accs = rawBalancoEntries.filter(tipoFilter);
    const total = totalRef || accs.reduce((s, a) => s + Math.abs(a.valor), 0) || 1;
    return accs
      .map((a) => ({
        nome: a.conta,
        valor: Math.abs(a.valor),
        percentual: (Math.abs(a.valor) / total) * 100,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 30);
  };

  const openDrillDown = (key: string) => {
    setActiveChartKey(key);
    const rb = Math.abs(dreData.receitaBruta) || 1;
    const at = balancoData.ativoTotal || 1;

    switch (key) {
      case "Rec. Bruta":
        setSelectedItem({
          titulo: "Receita Bruta",
          valor: Math.abs(dreData.receitaBruta),
          percentual: 100,
          composicao: buildComposicaoFromDRE("receita_bruta", Math.abs(dreData.receitaBruta)),
          scrollTargetId: "secao-dre",
        });
        return;
      case "Deduções": {
        const ded = Math.abs(dreData.receitaBruta - dreData.receitaLiquida);
        setSelectedItem({
          titulo: "Deduções da Receita",
          valor: ded,
          percentual: (ded / rb) * 100,
          composicao: buildComposicaoFromDRE("deducoes", ded),
          scrollTargetId: "secao-dre",
        });
        return;
      }
      case "Rec. Líquida":
        setSelectedItem({
          titulo: "Receita Líquida",
          valor: Math.abs(dreData.receitaLiquida),
          percentual: (Math.abs(dreData.receitaLiquida) / rb) * 100,
          descricao: "Receita Bruta menos Deduções (impostos sobre vendas, devoluções, etc.).",
          composicao: [],
          scrollTargetId: "secao-dre",
        });
        return;
      case "CMV":
        setSelectedItem({
          titulo: "Custos (CMV/CPV/CSP)",
          valor: Math.abs(dreData.cmv),
          percentual: (Math.abs(dreData.cmv) / rb) * 100,
          composicao: buildComposicaoFromDRE("cmv", Math.abs(dreData.cmv)),
          scrollTargetId: "secao-dre",
        });
        return;
      case "Lucro Bruto":
        setSelectedItem({
          titulo: "Lucro Bruto",
          valor: Math.abs(dreData.lucroBruto),
          percentual: (Math.abs(dreData.lucroBruto) / rb) * 100,
          descricao: "Receita Líquida menos Custos. Indica a eficiência operacional direta.",
          composicao: [],
          scrollTargetId: "secao-dre",
        });
        return;
      case "Desp. Op.":
        setSelectedItem({
          titulo: "Despesas Operacionais",
          valor: Math.abs(dreData.despesasOperacionais),
          percentual: (Math.abs(dreData.despesasOperacionais) / rb) * 100,
          composicao: buildComposicaoFromDRE(
            "despesas_operacionais",
            Math.abs(dreData.despesasOperacionais),
          ),
          scrollTargetId: "secao-dre",
        });
        return;
      case "L. Operac.":
        setSelectedItem({
          titulo: "Lucro Operacional",
          valor: Math.abs(dreData.lucroOperacional),
          percentual: (Math.abs(dreData.lucroOperacional) / rb) * 100,
          descricao: "Lucro Bruto menos Despesas Operacionais.",
          composicao: [],
          scrollTargetId: "secao-dre",
        });
        return;
      case "Res. Fin.":
        setSelectedItem({
          titulo: "Resultado Financeiro",
          valor: Math.abs(dreData.resultadoFinanceiro),
          percentual: (Math.abs(dreData.resultadoFinanceiro) / rb) * 100,
          composicao: buildComposicaoFromDRE(
            "resultado_financeiro",
            Math.abs(dreData.resultadoFinanceiro),
          ),
          scrollTargetId: "secao-dre",
        });
        return;
      case "L. Líquido":
      case "Lucro Líquido":
        setSelectedItem({
          titulo: "Lucro Líquido",
          valor: Math.abs(dreData.lucroLiquido),
          percentual: (Math.abs(dreData.lucroLiquido) / rb) * 100,
          descricao: "Resultado final após todos os custos, despesas e tributos sobre o lucro.",
          composicao: [],
          scrollTargetId: "secao-dre",
        });
        return;
      case "Ativo Circ.":
        setSelectedItem({
          titulo: "Ativo Circulante",
          valor: balancoData.ativoCirculante,
          percentual: (balancoData.ativoCirculante / at) * 100,
          composicao: buildComposicaoFromBalanco(
            (e) => e.tipo === "ativo_circulante",
            balancoData.ativoCirculante,
          ),
          scrollTargetId: "secao-balanco",
        });
        return;
      case "Ativo Não Circ.":
        setSelectedItem({
          titulo: "Ativo Não Circulante",
          valor: balancoData.ativoNaoCirculante,
          percentual: (balancoData.ativoNaoCirculante / at) * 100,
          composicao: buildComposicaoFromBalanco(
            (e) => e.tipo === "ativo_nao_circulante",
            balancoData.ativoNaoCirculante,
          ),
          scrollTargetId: "secao-balanco",
        });
        return;
      case "Passivo Circ.":
        setSelectedItem({
          titulo: "Passivo Circulante",
          valor: balancoData.passivoCirculante,
          percentual: (balancoData.passivoCirculante / at) * 100,
          composicao: buildComposicaoFromBalanco(
            (e) => e.tipo === "passivo_circulante",
            balancoData.passivoCirculante,
          ),
          scrollTargetId: "secao-balanco",
        });
        return;
      case "Passivo Não Circ.":
        setSelectedItem({
          titulo: "Passivo Não Circulante",
          valor: balancoData.passivoNaoCirculante,
          percentual: (balancoData.passivoNaoCirculante / at) * 100,
          composicao: buildComposicaoFromBalanco(
            (e) => e.tipo === "passivo_nao_circulante",
            balancoData.passivoNaoCirculante,
          ),
          scrollTargetId: "secao-balanco",
        });
        return;
      case "Patr. Líquido":
        setSelectedItem({
          titulo: "Patrimônio Líquido",
          valor: Math.abs(balancoData.patrimonioLiquido),
          percentual: (Math.abs(balancoData.patrimonioLiquido) / at) * 100,
          composicao: buildComposicaoFromBalanco(
            (e) => e.tipo === "patrimonio_liquido",
            Math.abs(balancoData.patrimonioLiquido),
          ),
          scrollTargetId: "secao-balanco",
        });
        return;
      default:
        return;
    }
  };

  const handleBarClick = (data: any) => {
    const key = data?.name || data?.grupo;
    if (key) openDrillDown(key);
  };

  const closeDrillDown = () => {
    setSelectedItem(null);
    setActiveChartKey(null);
  };

  const scrollToReport = () => {
    if (selectedItem?.scrollTargetId) {
      const el = document.getElementById(selectedItem.scrollTargetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    closeDrillDown();
  };

  const cellOpacity = (key: string, baseOpacity = 1) => {
    if (!activeChartKey) return baseOpacity;
    return activeChartKey === key ? baseOpacity : 0.25;
  };

  return (
    <>
      <IndicatorSection title="Demonstração do Resultado (DRE)" icon={TrendingUp}>
        {dreIndicators.map((config, i) => (
          <IndicatorCard key={i} config={config} />
        ))}
      </IndicatorSection>

      {/* Margens */}
      <IndicatorSection title="Margens e Rentabilidade" icon={Percent}>
        {marginIndicators.map((config, i) => (
          <IndicatorCard key={i} config={config} />
        ))}
      </IndicatorSection>

      {/* ── VISÃO GRÁFICA ───────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary" />
          Visão Gráfica
        </h2>

        <div className="grid md:grid-cols-2 gap-6">

          {/* ── GRÁFICO 1: Waterfall DRE ─────────────────────────────────── */}
          <div className="glass-card p-6">
            <div className="mb-4">
              <h3 className="font-display font-semibold text-foreground">Cascata do Resultado</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Impacto de cada etapa sobre a Receita Bruta
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={waterfallDreData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => {
                    if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
                    if (Math.abs(v) >= 1_000) return `R$${(v / 1_000).toFixed(0)}K`;
                    return `R$${v}`;
                  }}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <RechartsTooltip
                  formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="base" stackId="waterfall" fill="transparent" />
                <Bar
                  dataKey="valor"
                  stackId="waterfall"
                  radius={[4, 4, 0, 0]}
                  onClick={handleBarClick}
                  style={{ cursor: "pointer" }}
                >
                  {waterfallDreData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.cor}
                      fillOpacity={cellOpacity(entry.name, entry.tipo === "subtotal" ? 0.6 : 1)}
                    />
                  ))}
                  <LabelList
                    dataKey="valor"
                    position="top"
                    formatter={(v: number) => {
                      if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                      if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                      return v;
                    }}
                    style={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {[
                { cor: "#4A7FC1", label: "Receita" },
                { cor: "#EF4444", label: "Deduções/Custos" },
                { cor: "#6366F1", label: "Subtotais" },
                { cor: "#F59E0B", label: "Despesas" },
                { cor: "#10B981", label: "Resultado" },
              ].map(item => (
                <span key={item.label} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: item.cor }} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          {/* ── GRÁFICO 2: Barras Horizontais — Composição das Despesas ─────── */}
          <div className="glass-card p-6">
            <div className="mb-4">
              <h3 className="font-display font-semibold text-foreground">Destinação da Receita Líquida</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Como cada componente consome a receita líquida (%)
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={despesasBarData}
                layout="vertical"
                margin={{ top: 5, right: 50, left: 10, bottom: 5 }}
              >
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={80}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  formatter={(v: number, name: string, props: any) => [
                    `${v.toFixed(1)}% — ${props.payload.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
                    props.payload.name,
                  ]}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="pct"
                  radius={[0, 6, 6, 0]}
                  maxBarSize={36}
                  onClick={handleBarClick}
                  style={{ cursor: "pointer" }}
                >
                  {despesasBarData.map((entry, idx) => {
                    const cores = ["#EF4444", "#F59E0B", "#6366F1", "#10B981"];
                    return (
                      <Cell
                        key={idx}
                        fill={cores[idx % cores.length]}
                        fillOpacity={cellOpacity(entry.name)}
                      />
                    );
                  })}
                  <LabelList
                    dataKey="pct"
                    position="right"
                    formatter={(v: number) => `${v.toFixed(1)}%`}
                    style={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── GRÁFICO 3: Barras Empilhadas Espelhadas — Balanço Patrimonial ── */}
          <div className="glass-card p-6">
            <div className="mb-4">
              <h3 className="font-display font-semibold text-foreground">Estrutura Patrimonial</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Ativo vs Passivo + Patrimônio Líquido
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={balancoEspelhadoData}
                margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
              >
                <XAxis
                  dataKey="grupo"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => {
                    if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
                    if (Math.abs(v) >= 1_000) return `R$${(v / 1_000).toFixed(0)}K`;
                    return `R$${v}`;
                  }}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <RechartsTooltip
                  formatter={(v: number, name: string) =>
                    v > 0 ? [v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), name] : null as any
                  }
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 11 }}>{value}</span>
                  )}
                />
                <Bar
                  dataKey="Ativo Circ."
                  stackId="bp"
                  fill="#4A7FC1"
                  fillOpacity={cellOpacity("Ativo Circ.")}
                  onClick={() => openDrillDown("Ativo Circ.")}
                  style={{ cursor: "pointer" }}
                />
                <Bar
                  dataKey="Ativo Não Circ."
                  stackId="bp"
                  fill="#6366F1"
                  radius={[4, 4, 0, 0]}
                  fillOpacity={cellOpacity("Ativo Não Circ.")}
                  onClick={() => openDrillDown("Ativo Não Circ.")}
                  style={{ cursor: "pointer" }}
                />
                <Bar
                  dataKey="Passivo Circ."
                  stackId="bp"
                  fill="#EF4444"
                  fillOpacity={cellOpacity("Passivo Circ.")}
                  onClick={() => openDrillDown("Passivo Circ.")}
                  style={{ cursor: "pointer" }}
                />
                <Bar
                  dataKey="Passivo Não Circ."
                  stackId="bp"
                  fill="#F59E0B"
                  fillOpacity={cellOpacity("Passivo Não Circ.")}
                  onClick={() => openDrillDown("Passivo Não Circ.")}
                  style={{ cursor: "pointer" }}
                />
                <Bar
                  dataKey="Patr. Líquido"
                  stackId="bp"
                  fill="#10B981"
                  radius={[4, 4, 0, 0]}
                  fillOpacity={cellOpacity("Patr. Líquido")}
                  onClick={() => openDrillDown("Patr. Líquido")}
                  style={{ cursor: "pointer" }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── GRÁFICO 4: Barras Horizontais — % do Ativo (Estrutura de Capital) */}
          <div className="glass-card p-6">
            <div className="mb-4">
              <h3 className="font-display font-semibold text-foreground">Composição do Ativo e Capital</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Participação de cada grupo sobre o Ativo Total
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={estruturaCapitalData}
                layout="vertical"
                margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
              >
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  formatter={(v: number, name: string, props: any) => [
                    `${v.toFixed(1)}% — ${props.payload.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
                    props.payload.name,
                  ]}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="pct"
                  radius={[0, 6, 6, 0]}
                  maxBarSize={32}
                  onClick={handleBarClick}
                  style={{ cursor: "pointer" }}
                >
                  {estruturaCapitalData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.cor} fillOpacity={cellOpacity(entry.name)} />
                  ))}
                  <LabelList
                    dataKey="pct"
                    position="right"
                    formatter={(v: number) => `${v.toFixed(1)}%`}
                    style={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      </section>

      {/* Balanço */}
      <IndicatorSection title="Balanço Patrimonial" icon={Scale}>
        {balancoIndicators.map((config, i) => (
          <IndicatorCard key={i} config={config} />
        ))}
      </IndicatorSection>

      {/* Solvência & Rentabilidade */}
      <IndicatorSection title="Solvência & Rentabilidade" icon={ShieldCheck}>
        {solvenciaIndicators.map((config, i) => (
          <IndicatorCard key={i} config={config} />
        ))}
      </IndicatorSection>

      {/* DRE Debug */}
      {dreClassifiedEntries.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold flex items-center gap-2">
              🔬 Debug: Classificação DRE
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDreDebug(!showDreDebug)}
            >
              <FileSearch className="w-4 h-4 mr-2" />
              {showDreDebug ? "Ocultar" : "Ver"} Classificação ({dreClassifiedEntries.length} linhas)
            </Button>
          </div>
          {showDreDebug && (
            <div className="glass-card p-6">
              <p className="text-sm text-muted-foreground mb-4">
                Todas as linhas DRE importadas com seu grupo e classificação:
              </p>

              {/* Group Legend */}
              <div className="flex flex-wrap gap-2 mb-4">
                {(['receita_bruta', 'receita_liquida', 'cmv', 'lucro_bruto', 'despesas_operacionais', 'lucro_operacional', 'resultado_financeiro', 'lucro_liquido'] as const).map((grupo) => (
                  <span key={grupo} className={`px-2 py-1 rounded text-xs font-medium border ${getDREGroupColor(grupo)}`}>
                    {getDREGroupLabel(grupo)}
                  </span>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">#</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Descrição</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Grupo</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Valor</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Tipo</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dreClassifiedEntries.map((entry, index) => (
                      <tr
                        key={index}
                        className={`border-b border-border/50 hover:bg-muted/30 ${entry.isExplicit ? 'font-semibold' : ''}`}
                      >
                        <td className="py-2 px-3 text-muted-foreground">{index + 1}</td>
                        <td className="py-2 px-3 text-foreground max-w-xs">
                          <span className="block truncate" title={entry.descricao}>
                            {entry.descricao}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${getDREGroupColor(entry.grupo)}`}>
                            {getDREGroupLabel(entry.grupo)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-foreground">
                          {entry.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {entry.isExplicit
                            ? <span className="px-2 py-1 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">Explícita</span>
                            : <span className="px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground border border-border">Componente</span>
                          }
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs max-w-xs truncate" title={entry.motivo}>
                          {entry.motivo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary by Group */}
              <div className="mt-6 pt-4 border-t border-border">
                <h4 className="font-medium mb-3">Resumo por Grupo</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(['receita_bruta', 'receita_liquida', 'cmv', 'lucro_bruto', 'despesas_operacionais', 'lucro_operacional', 'resultado_financeiro', 'lucro_liquido'] as const).map((grupo) => {
                    const entriesInGroup = dreClassifiedEntries.filter(e => e.grupo === grupo);
                    const explicitEntry = entriesInGroup.find(e => e.isExplicit);
                    const sumValue = entriesInGroup.reduce((sum, e) => sum + e.valor, 0);

                    return (
                      <div key={grupo} className={`p-3 rounded border ${getDREGroupColor(grupo)}`}>
                        <div className="text-xs font-medium mb-1">{getDREGroupLabel(grupo)}</div>
                        <div className="text-sm font-bold">
                          {(explicitEntry?.valor ?? sumValue).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </div>
                        <div className="text-xs opacity-70">
                          {explicitEntry ? '(linha explícita)' : `(${entriesInGroup.length} linhas)`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
