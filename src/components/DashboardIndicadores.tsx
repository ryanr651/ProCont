import { useMemo } from "react";
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
  PieChart as PieChartIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ProgressBar";
import { IndicatorCard, IndicatorSection, type IndicatorConfig, type AccountDetail } from "@/components/IndicatorCard";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
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

  // Liquidez seca: (AC - Estoques) / PC — only analytic (leaf) entries to avoid double-counting
  const estoques = useMemo(() => {
    return rawBalancoEntries
      .filter((e) => {
        if (e.natureza_conta === 'sintetica') return false;
        const conta = e.conta.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return conta.includes("ESTOQUE") || conta.includes("ESTOQUES");
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
      variant: dreData.margemLiquida >= 10 ? "success" : dreData.margemLiquida >= 3 ? "warning" : "danger",
      formula: "(Lucro Líquido ÷ Receita Líquida) × 100",
      formulaDescription: "Percentual final que efetivamente vira lucro para os sócios.",
      accounts: [
        { descricao: "Lucro Líquido", valor: dreData.lucroLiquido, motivo: "Numerador" },
        { descricao: "Receita Líquida", valor: dreData.receitaLiquida, motivo: "Denominador" },
      ],
      trend: dreData.margemLiquida >= 10 ? "up" : dreData.margemLiquida < 3 ? "down" : "neutral",
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
  const balancoIndicators: IndicatorConfig[] = [
    {
      title: "Ativo Total",
      value: balancoData.ativoTotal,
      format: "currency",
      icon: Building,
      variant: "highlight",
      formula: "Ativo Circulante + Ativo Não Circulante",
      formulaDescription: "Total de bens e direitos da empresa.",
      accounts: [
        { descricao: "Ativo Circulante", valor: balancoData.ativoCirculante, motivo: "Bens de curto prazo" },
        { descricao: "Ativo Não Circulante", valor: balancoData.ativoNaoCirculante, motivo: "Bens de longo prazo" },
      ],
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
      variant: roe >= 15 ? "success" : roe >= 5 ? "warning" : "danger",
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
      variant: roa >= 8 ? "success" : roa >= 3 ? "warning" : "danger",
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

  // Normalize a value to 0-100 range for radar
  const clamp = (v: number, max: number) => Math.min(Math.max((v / max) * 100, 0), 100);

  const radarData = useMemo(() => [
    { label: "M. Bruta", value: clamp(dreData.margemBruta, 60) },
    { label: "M. Oper.", value: clamp(dreData.margemOperacional, 40) },
    { label: "M. Líquida", value: clamp(dreData.margemLiquida, 30) },
    { label: "M. EBITDA", value: clamp(margemEbitda, 50) },
    { label: "Liq. Corrente", value: clamp(liquidezCorrente, 3) },
    { label: "ROE", value: clamp(roe, 30) },
    { label: "ROA", value: clamp(roa, 15) },
  ], [dreData, margemEbitda, liquidezCorrente, roe, roa]);

  const drePieData = useMemo(() => {
    const items = [
      { name: "CMV", value: Math.abs(dreData.cmv) },
      { name: "Desp. Operacionais", value: Math.abs(dreData.despesasOperacionais) },
      { name: "Lucro Líquido", value: Math.abs(dreData.lucroLiquido) },
    ].filter(d => d.value > 0);
    const rest = Math.abs(dreData.receitaLiquida) - items.reduce((s, i) => s + i.value, 0);
    if (rest > 0) items.push({ name: "Outros", value: rest });
    return items;
  }, [dreData]);

  const ativoPieData = useMemo(() => [
    { name: "Ativo Circulante", value: balancoData.ativoCirculante },
    { name: "Ativo Não Circulante", value: balancoData.ativoNaoCirculante },
  ].filter(d => d.value > 0), [balancoData]);

  const capitalPieData = useMemo(() => [
    { name: "Passivo Circulante", value: balancoData.passivoCirculante },
    { name: "Passivo Não Circulante", value: balancoData.passivoNaoCirculante },
    { name: "Patrimônio Líquido", value: Math.abs(balancoData.patrimonioLiquido) },
  ].filter(d => d.value > 0), [balancoData]);

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

      {/* Gráficos Visuais */}
      <section className="mb-10">
        <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
          <PieChartIcon className="w-6 h-6 text-primary" />
          Visão Gráfica
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Radar Chart – Indicadores Financeiros */}
          <div className="glass-card p-6">
            <h3 className="font-display font-semibold mb-4">Radar de Indicadores</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} domain={[0, 100]} />
                <Radar name="Indicador" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2 text-center">Valores normalizados de 0 a 100 para comparação visual</p>
          </div>

          {/* Pie Chart – Composição da DRE */}
          <div className="glass-card p-6">
            <h3 className="font-display font-semibold mb-4">Composição da DRE</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={drePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2} label={({ name, percent }) => { const p = percent * 100; return `${name} ${p < 1 && p > 0 ? p.toFixed(1) : p.toFixed(0)}%`; }} labelLine={false}>
                  {drePieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart – Composição do Ativo */}
          <div className="glass-card p-6">
            <h3 className="font-display font-semibold mb-4">Composição do Ativo</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={ativoPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {ativoPieData.map((_, idx) => (
                    <Cell key={idx} fill={BALANCE_COLORS[idx % BALANCE_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart – Estrutura de Capital */}
          <div className="glass-card p-6">
            <h3 className="font-display font-semibold mb-4">Estrutura de Capital</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={capitalPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {capitalPieData.map((_, idx) => (
                    <Cell key={idx} fill={CAPITAL_COLORS[idx % CAPITAL_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
                <Legend />
              </PieChart>
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
