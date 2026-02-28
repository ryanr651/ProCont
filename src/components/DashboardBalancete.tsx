import { useMemo } from "react";
import {
  Activity,
  ShieldCheck,
  Scale,
  Landmark,
  TrendingUp,
  TrendingDown,
  Wallet,
  Building,
  Target,
  Clock,
  ArrowRightLeft,
  Banknote,
  Factory,
  Timer,
  BarChart3,
} from "lucide-react";
import { IndicatorCard, IndicatorSection, type IndicatorConfig, type AccountDetail } from "@/components/IndicatorCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";

export interface BalanceteClassifiedEntry {
  conta: string;
  grupo: string;
  saldo_anterior: number;
  debitos: number;
  creditos: number;
  saldo_atual: number;
  natureza: string;
}

export interface PreviousPeriodBalanceteData {
  ano: string;
  entries: BalanceteClassifiedEntry[];
}

interface DashboardBalanceteProps {
  entries: BalanceteClassifiedEntry[];
  previousPeriods?: PreviousPeriodBalanceteData[];
  dreReceitaBruta?: number;
  dreCMV?: number;
}

// Map AI grupo to aggregation buckets
function sumByGrupo(entries: BalanceteClassifiedEntry[], grupos: string[]): number {
  return entries
    .filter((e) => grupos.some((g) => e.grupo.toUpperCase().includes(g)))
    .reduce((sum, e) => sum + Math.abs(e.saldo_atual), 0);
}

function accountsForGrupos(entries: BalanceteClassifiedEntry[], grupos: string[]): AccountDetail[] {
  return entries
    .filter((e) => grupos.some((g) => e.grupo.toUpperCase().includes(g)))
    .map((e) => ({
      descricao: e.conta,
      valor: e.saldo_atual,
      motivo: e.grupo,
    }));
}

export function DashboardBalancete({ entries, previousPeriods, dreReceitaBruta, dreCMV }: DashboardBalanceteProps) {
  const data = useMemo(() => {
    // Aggregate balancete accounts into financial groups
    const disponibilidades = sumByGrupo(entries, ["DISPONIBILIDADES", "CAIXA", "BANCO", "APLICAC"]);
    const contasReceber = sumByGrupo(entries, ["CONTAS_A_RECEBER", "CLIENTES"]);
    const estoques = sumByGrupo(entries, ["ESTOQUE"]);
    const fornecedores = sumByGrupo(entries, ["FORNECEDOR"]);
    const imobilizado = sumByGrupo(entries, ["IMOBILIZADO"]);

    const ativoCirculante = sumByGrupo(entries, ["DISPONIBILIDADES", "CAIXA", "BANCO", "CONTAS_A_RECEBER", "CLIENTES", "ESTOQUE", "ATIVO_CIRCULANTE", "APLICAC"]);
    const ativoNaoCirculante = sumByGrupo(entries, ["ATIVO_NAO_CIRCULANTE", "IMOBILIZADO", "INTANGIVEL", "INVESTIMENTO", "REALIZAVEL"]);
    const ativoTotal = ativoCirculante + ativoNaoCirculante;
    
    const passivoCirculante = sumByGrupo(entries, ["FORNECEDOR", "OBRIGAC", "PASSIVO_CIRCULANTE", "EMPRESTIMO_CP", "SALARIOS_A_PAGAR", "IMPOSTOS_A_PAGAR", "PROVISAO_CP"]);
    const passivoNaoCirculante = sumByGrupo(entries, ["PASSIVO_NAO_CIRCULANTE", "EMPRESTIMO_LP", "FINANCIAMENTO_LP", "PROVISAO_LP"]);
    const passivoTotal = passivoCirculante + passivoNaoCirculante;
    const patrimonioLiquido = sumByGrupo(entries, ["PATRIMONIO", "CAPITAL_SOCIAL", "RESERVA", "LUCROS_ACUMULADOS", "PREJUIZOS"]);

    // Operational breakdown
    const passivoOperacional = sumByGrupo(entries, ["FORNECEDOR", "SALARIOS_A_PAGAR", "IMPOSTOS_A_PAGAR", "OBRIGAC"]);
    const passivoFinanceiro = sumByGrupo(entries, ["EMPRESTIMO_CP"]);
    const ativoCirculanteOperacional = contasReceber + estoques;
    const ativoCirculanteFinanceiro = disponibilidades;

    // Previous period averages for average terms
    let prevContasReceber = contasReceber;
    let prevFornecedores = fornecedores;
    if (previousPeriods && previousPeriods.length > 0) {
      const lastPrev = previousPeriods[previousPeriods.length - 1];
      prevContasReceber = sumByGrupo(lastPrev.entries, ["CONTAS_A_RECEBER", "CLIENTES"]);
      prevFornecedores = sumByGrupo(lastPrev.entries, ["FORNECEDOR"]);
    }
    const mediaContasReceber = (contasReceber + prevContasReceber) / 2;
    const mediaFornecedores = (fornecedores + prevFornecedores) / 2;

    return {
      disponibilidades, contasReceber, estoques, fornecedores, imobilizado,
      ativoCirculante, ativoNaoCirculante, ativoTotal,
      passivoCirculante, passivoNaoCirculante, passivoTotal, patrimonioLiquido,
      passivoOperacional, passivoFinanceiro,
      ativoCirculanteOperacional, ativoCirculanteFinanceiro,
      mediaContasReceber, mediaFornecedores,
    };
  }, [entries, previousPeriods]);

  // ===== Basic Indicators =====
  const liquidezCorrente = data.passivoCirculante > 0 ? data.ativoCirculante / data.passivoCirculante : 0;
  const liquidezSeca = data.passivoCirculante > 0 ? (data.ativoCirculante - data.estoques) / data.passivoCirculante : 0;
  const endividamento = data.patrimonioLiquido > 0 ? data.passivoTotal / data.patrimonioLiquido : 0;
  const capitalGiro = data.ativoCirculante - data.passivoCirculante;

  // ===== Item 1: Structure & Solvency =====
  const composicaoEndiv = data.passivoTotal > 0 ? (data.passivoCirculante / data.passivoTotal) * 100 : 0;
  const imobilizacaoPL = data.patrimonioLiquido > 0 ? (data.imobilizado / data.patrimonioLiquido) * 100 : 0;

  // ===== Item 2: Average Terms =====
  const receitaBrutaMensal = (dreReceitaBruta || 0) / 12;
  const cmvMensal = Math.abs(dreCMV || 0) / 12;
  const vendaDiaria = receitaBrutaMensal / 30;
  const cmvDiario = cmvMensal / 30;

  const pmr = vendaDiaria > 0 ? data.mediaContasReceber / vendaDiaria : 0;
  const pmp = cmvDiario > 0 ? data.mediaFornecedores / cmvDiario : 0;
  // Prazo Médio de Estoques (PME): Estoque / (CMV diário)
  const pme = cmvDiario > 0 ? data.estoques / cmvDiario : 0;
  const cicloFinanceiro = pmr + pme - pmp;

  // ===== Item 3: Working Capital =====
  const ncg = data.ativoCirculanteOperacional - data.passivoOperacional;
  const saldoTesouraria = data.ativoCirculanteFinanceiro - data.passivoFinanceiro;

  const hasDREData = (dreReceitaBruta || 0) > 0 || (dreCMV || 0) !== 0;

  // ===== Indicators Arrays =====
  const indicators: IndicatorConfig[] = [
    {
      title: "Liquidez Corrente",
      value: liquidezCorrente,
      format: "ratio",
      icon: Activity,
      variant: liquidezCorrente >= 1.5 ? "success" : liquidezCorrente >= 1 ? "warning" : "danger",
      formula: "Ativo Circulante ÷ Passivo Circulante",
      formulaDescription: "Capacidade de pagar dívidas de curto prazo com ativos circulantes. Ideal > 1,5.",
      accounts: [
        ...accountsForGrupos(entries, ["DISPONIBILIDADES", "CAIXA", "BANCO", "CONTAS_A_RECEBER", "CLIENTES", "ESTOQUE", "ATIVO_CIRCULANTE", "APLICAC"]),
        { descricao: "─── Passivo Circulante (denominador) ───", valor: 0, motivo: "" },
        ...accountsForGrupos(entries, ["FORNECEDOR", "OBRIGAC", "PASSIVO_CIRCULANTE", "EMPRESTIMO_CP", "SALARIOS_A_PAGAR", "IMPOSTOS_A_PAGAR"]),
      ],
      trend: liquidezCorrente >= 1.5 ? "up" : liquidezCorrente < 1 ? "down" : "neutral",
      subtitle: liquidezCorrente >= 1.5 ? "Saudável" : liquidezCorrente >= 1 ? "Adequada" : "Risco",
      visible: data.passivoCirculante > 0,
    },
    {
      title: "Liquidez Seca",
      value: liquidezSeca,
      format: "ratio",
      icon: ShieldCheck,
      variant: liquidezSeca >= 1 ? "success" : liquidezSeca >= 0.7 ? "warning" : "danger",
      formula: "(Ativo Circulante − Estoques) ÷ Passivo Circulante",
      formulaDescription: "Capacidade de pagamento sem depender da venda de estoques. Ideal > 1.",
      accounts: [
        { descricao: "Ativo Circulante", valor: data.ativoCirculante, motivo: "Base" },
        { descricao: "Estoques (deduzidos)", valor: -data.estoques, motivo: "Removido por ser menos líquido" },
        { descricao: "Passivo Circulante", valor: data.passivoCirculante, motivo: "Denominador" },
      ],
      visible: data.passivoCirculante > 0,
    },
    {
      title: "Grau de Endividamento",
      value: endividamento,
      format: "ratio",
      icon: TrendingDown,
      variant: endividamento <= 1 ? "success" : endividamento <= 2 ? "warning" : "danger",
      formula: "Passivo Total ÷ Patrimônio Líquido",
      formulaDescription: "Relação entre capital de terceiros e capital próprio. Ideal < 1.",
      accounts: [
        { descricao: "Passivo Total", valor: data.passivoTotal, motivo: "Numerador" },
        { descricao: "Patrimônio Líquido", valor: data.patrimonioLiquido, motivo: "Denominador" },
      ],
      trend: endividamento <= 1 ? "up" : endividamento > 2 ? "down" : "neutral",
      visible: data.patrimonioLiquido > 0,
    },
    {
      title: "Capital de Giro Líquido",
      value: capitalGiro,
      format: "currency",
      icon: Wallet,
      variant: capitalGiro > 0 ? "success" : "danger",
      formula: "Ativo Circulante − Passivo Circulante",
      formulaDescription: "Recursos de curto prazo disponíveis após pagar obrigações de curto prazo.",
      accounts: [
        { descricao: "Ativo Circulante", valor: data.ativoCirculante, motivo: "Recursos de curto prazo" },
        { descricao: "Passivo Circulante", valor: -data.passivoCirculante, motivo: "Obrigações de curto prazo" },
      ],
      trend: capitalGiro > 0 ? "up" : "down",
    },
    {
      title: "Composição do Endividamento",
      value: composicaoEndiv,
      format: "percentage",
      icon: Scale,
      variant: composicaoEndiv <= 50 ? "success" : composicaoEndiv <= 70 ? "warning" : "danger",
      formula: "(Passivo Circulante ÷ Passivo Total) × 100",
      formulaDescription: "Quanto da dívida vence no curto prazo. Ideal < 50%.",
      accounts: [
        { descricao: "Passivo Circulante", valor: data.passivoCirculante, motivo: "Dívidas de curto prazo" },
        { descricao: "Passivo Não Circulante", valor: data.passivoNaoCirculante, motivo: "Dívidas de longo prazo" },
      ],
      visible: data.passivoTotal > 0,
    },
    {
      title: "Imobilização do PL",
      value: imobilizacaoPL,
      format: "percentage",
      icon: Factory,
      variant: imobilizacaoPL <= 50 ? "success" : imobilizacaoPL <= 80 ? "warning" : "danger",
      formula: "(Ativo Imobilizado ÷ Patrimônio Líquido) × 100",
      formulaDescription: "Quanto do capital próprio está investido em ativos fixos. Ideal < 50%. Acima de 80% pode indicar falta de liquidez.",
      accounts: [
        ...accountsForGrupos(entries, ["IMOBILIZADO"]),
        { descricao: "─── Patrimônio Líquido (denominador) ───", valor: 0, motivo: "" },
        ...accountsForGrupos(entries, ["PATRIMONIO", "CAPITAL_SOCIAL", "RESERVA", "LUCROS_ACUMULADOS"]),
      ],
      visible: data.patrimonioLiquido > 0 && data.imobilizado > 0,
    },
  ];

  // Structure summary
  const structureIndicators: IndicatorConfig[] = [
    {
      title: "Ativo Total",
      value: data.ativoTotal,
      format: "currency",
      icon: Building,
      variant: "highlight",
      formula: "Ativo Circulante + Ativo Não Circulante",
      formulaDescription: "Soma de todos os bens e direitos da empresa extraídos do balancete.",
      accounts: [
        { descricao: "Ativo Circulante", valor: data.ativoCirculante, motivo: "Curto prazo" },
        { descricao: "Ativo Não Circulante", valor: data.ativoNaoCirculante, motivo: "Longo prazo" },
      ],
    },
    {
      title: "Passivo Total",
      value: data.passivoTotal,
      format: "currency",
      icon: Scale,
      formula: "Passivo Circulante + Passivo Não Circulante",
      formulaDescription: "Soma de todas as obrigações com terceiros.",
      accounts: [
        { descricao: "Passivo Circulante", valor: data.passivoCirculante, motivo: "Curto prazo" },
        { descricao: "Passivo Não Circulante", valor: data.passivoNaoCirculante, motivo: "Longo prazo" },
      ],
    },
    {
      title: "Patrimônio Líquido",
      value: data.patrimonioLiquido,
      format: "currency",
      icon: Landmark,
      variant: "accent",
      formula: "Capital Social + Reservas + Lucros Acumulados",
      formulaDescription: "Recursos próprios dos sócios no balancete.",
      accounts: accountsForGrupos(entries, ["PATRIMONIO", "CAPITAL_SOCIAL", "RESERVA", "LUCROS_ACUMULADOS"]),
    },
  ];

  // Movement summary (flow indicators from debits/credits)
  const totalDebitos = entries.reduce((s, e) => s + e.debitos, 0);
  const totalCreditos = entries.reduce((s, e) => s + e.creditos, 0);

  const movementIndicators: IndicatorConfig[] = [
    {
      title: "Total de Débitos",
      value: totalDebitos,
      format: "currency",
      icon: TrendingUp,
      formula: "Σ Débitos de todas as contas",
      formulaDescription: "Soma de toda a movimentação a débito no período. Indica fluxo de saída/entrada conforme natureza.",
      accounts: entries
        .filter(e => e.debitos > 0)
        .sort((a, b) => b.debitos - a.debitos)
        .slice(0, 15)
        .map(e => ({ descricao: e.conta, valor: e.debitos, motivo: e.grupo })),
    },
    {
      title: "Total de Créditos",
      value: totalCreditos,
      format: "currency",
      icon: TrendingDown,
      formula: "Σ Créditos de todas as contas",
      formulaDescription: "Soma de toda a movimentação a crédito no período.",
      accounts: entries
        .filter(e => e.creditos > 0)
        .sort((a, b) => b.creditos - a.creditos)
        .slice(0, 15)
        .map(e => ({ descricao: e.conta, valor: e.creditos, motivo: e.grupo })),
    },
  ];

  // ===== Average Terms Indicators =====
  const averageTermIndicators: IndicatorConfig[] = [
    {
      title: "PMR (Prazo Médio de Recebimento)",
      value: pmr,
      format: "ratio",
      icon: Clock,
      variant: pmr <= 45 ? "success" : pmr <= 90 ? "warning" : "danger",
      formula: "Média de Clientes ÷ (Receita Bruta Mensal ÷ 30)",
      formulaDescription: `Somamos o saldo de Contas a Receber (R$ ${data.mediaContasReceber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) e dividimos pela média de vendas diárias de R$ ${vendaDiaria.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. ${previousPeriods && previousPeriods.length > 0 ? 'Foi utilizada a média entre o período atual e o anterior.' : 'Apenas o saldo final foi utilizado (período único).'}`,
      accounts: [
        ...accountsForGrupos(entries, ["CONTAS_A_RECEBER", "CLIENTES"]),
        { descricao: "─── Receita Bruta Anual ───", valor: dreReceitaBruta || 0, motivo: "Dividido por 360 para obter vendas diárias" },
      ],
      subtitle: `${pmr.toFixed(0)} dias`,
      visible: hasDREData && data.contasReceber > 0,
    },
    {
      title: "PMP (Prazo Médio de Pagamento)",
      value: pmp,
      format: "ratio",
      icon: Timer,
      variant: pmp >= 30 ? "success" : pmp >= 15 ? "warning" : "danger",
      formula: "Média de Fornecedores ÷ (CMV Mensal ÷ 30)",
      formulaDescription: `Somamos o saldo de Fornecedores (R$ ${data.mediaFornecedores.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) e dividimos pelo custo diário de R$ ${cmvDiario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. ${previousPeriods && previousPeriods.length > 0 ? 'Foi utilizada a média entre o período atual e o anterior.' : 'Apenas o saldo final foi utilizado (período único).'}`,
      accounts: [
        ...accountsForGrupos(entries, ["FORNECEDOR"]),
        { descricao: "─── CMV Anual ───", valor: Math.abs(dreCMV || 0), motivo: "Dividido por 360 para obter custo diário" },
      ],
      subtitle: `${pmp.toFixed(0)} dias`,
      visible: hasDREData && data.fornecedores > 0,
    },
    {
      title: "PME (Prazo Médio de Estoques)",
      value: pme,
      format: "ratio",
      icon: ArrowRightLeft,
      variant: pme <= 60 ? "success" : pme <= 120 ? "warning" : "danger",
      formula: "Estoques ÷ (CMV Mensal ÷ 30)",
      formulaDescription: `Estoques de R$ ${data.estoques.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} divididos pelo CMV diário.`,
      accounts: [
        ...accountsForGrupos(entries, ["ESTOQUE"]),
        { descricao: "─── CMV Anual ───", valor: Math.abs(dreCMV || 0), motivo: "Dividido por 360 para obter custo diário" },
      ],
      subtitle: `${pme.toFixed(0)} dias`,
      visible: hasDREData && data.estoques > 0,
    },
    {
      title: "Ciclo Financeiro",
      value: cicloFinanceiro,
      format: "ratio",
      icon: BarChart3,
      variant: cicloFinanceiro <= 30 ? "success" : cicloFinanceiro <= 60 ? "warning" : "danger",
      formula: "PMR + PME − PMP",
      formulaDescription: `Tempo médio entre o pagamento ao fornecedor e o recebimento do cliente. Ciclo atual: ${pmr.toFixed(0)}d (receber) + ${pme.toFixed(0)}d (estoques) − ${pmp.toFixed(0)}d (pagar) = ${cicloFinanceiro.toFixed(0)} dias. Quanto menor, melhor.`,
      accounts: [
        { descricao: "PMR (Prazo Médio de Recebimento)", valor: pmr, motivo: `${pmr.toFixed(0)} dias` },
        { descricao: "PME (Prazo Médio de Estoques)", valor: pme, motivo: `${pme.toFixed(0)} dias` },
        { descricao: "PMP (Prazo Médio de Pagamento)", valor: -pmp, motivo: `${pmp.toFixed(0)} dias (deduzido)` },
      ],
      subtitle: `${cicloFinanceiro.toFixed(0)} dias`,
      trend: cicloFinanceiro <= 30 ? "up" : cicloFinanceiro > 60 ? "down" : "neutral",
      visible: hasDREData,
    },
  ];

  // ===== Working Capital Indicators =====
  const workingCapitalIndicators: IndicatorConfig[] = [
    {
      title: "NCG (Necessidade de Capital de Giro)",
      value: ncg,
      format: "currency",
      icon: Banknote,
      variant: ncg <= 0 ? "success" : ncg <= data.ativoCirculante * 0.3 ? "warning" : "danger",
      formula: "Ativo Circulante Operacional − Passivo Circulante Operacional",
      formulaDescription: "Recursos necessários para financiar o ciclo operacional. NCG negativa indica que o passivo operacional financia o ativo operacional (situação confortável).",
      accounts: [
        { descricao: "Contas a Receber", valor: data.contasReceber, motivo: "AC Operacional" },
        { descricao: "Estoques", valor: data.estoques, motivo: "AC Operacional" },
        { descricao: "─── Passivo Operacional ───", valor: 0, motivo: "" },
        ...accountsForGrupos(entries, ["FORNECEDOR", "SALARIOS_A_PAGAR", "IMPOSTOS_A_PAGAR", "OBRIGAC"]).map(a => ({ ...a, valor: -Math.abs(a.valor) })),
      ],
      trend: ncg <= 0 ? "up" : "down",
    },
    {
      title: "Saldo de Tesouraria",
      value: saldoTesouraria,
      format: "currency",
      icon: Wallet,
      variant: saldoTesouraria > 0 ? "success" : "danger",
      formula: "Ativo Circulante Financeiro − Passivo Circulante Financeiro",
      formulaDescription: "Diferença entre disponibilidades e empréstimos de curto prazo. Positivo indica folga financeira, negativo indica dependência de empréstimos.",
      accounts: [
        ...accountsForGrupos(entries, ["DISPONIBILIDADES", "CAIXA", "BANCO", "APLICAC"]),
        { descricao: "─── PC Financeiro (Empréstimos CP) ───", valor: 0, motivo: "" },
        ...accountsForGrupos(entries, ["EMPRESTIMO_CP"]).map(a => ({ ...a, valor: -Math.abs(a.valor) })),
      ],
      trend: saldoTesouraria > 0 ? "up" : "down",
    },
  ];

  // ===== Financial Cycle Chart Data =====
  const cycleChartData = [
    { name: "PMR", value: Math.round(pmr), fill: "hsl(221, 83%, 53%)" },
    { name: "PME", value: Math.round(pme), fill: "hsl(262, 83%, 58%)" },
    { name: "PMP", value: Math.round(pmp), fill: "hsl(142, 76%, 36%)" },
    { name: "Ciclo", value: Math.round(cicloFinanceiro), fill: cicloFinanceiro <= 30 ? "hsl(142, 76%, 36%)" : cicloFinanceiro <= 60 ? "hsl(47, 96%, 53%)" : "hsl(0, 84%, 60%)" },
  ];

  return (
    <>
      <IndicatorSection title="Estrutura Patrimonial (Balancete)" icon={Building}>
        {structureIndicators.map((config, i) => (
          <IndicatorCard key={i} config={config} />
        ))}
      </IndicatorSection>

      <IndicatorSection title="Indicadores de Liquidez e Solvência" icon={ShieldCheck}>
        {indicators.map((config, i) => (
          <IndicatorCard key={i} config={config} />
        ))}
      </IndicatorSection>

      {/* Average Terms - only if DRE data is available */}
      {hasDREData && (
        <>
          <IndicatorSection title="Prazos Médios (Atividade)" icon={Clock}>
            {averageTermIndicators.map((config, i) => (
              <IndicatorCard key={i} config={config} />
            ))}
          </IndicatorSection>

          {/* Financial Cycle Chart */}
          {(pmr > 0 || pmp > 0 || pme > 0) && (
            <section className="mb-10">
              <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
                <BarChart3 className="w-6 h-6 text-primary" />
                Gráfico do Ciclo Financeiro
              </h2>
              <div className="glass-card p-6">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={cycleChartData} layout="vertical" margin={{ left: 30, right: 40, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} unit=" dias" />
                    <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--foreground))", fontSize: 13, fontWeight: 500 }} width={50} />
                    <RechartsTooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--foreground))",
                      }}
                      formatter={(value: number) => [`${value} dias`, ""]}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                      {cycleChartData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                      <LabelList dataKey="value" position="right" fill="hsl(var(--foreground))" fontSize={13} formatter={(v: number) => `${v}d`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Ciclo Financeiro = PMR ({Math.round(pmr)}d) + PME ({Math.round(pme)}d) − PMP ({Math.round(pmp)}d) = <strong>{Math.round(cicloFinanceiro)} dias</strong>
                </p>
              </div>
            </section>
          )}
        </>
      )}

      {/* Working Capital */}
      <IndicatorSection title="Capital de Giro e Tesouraria" icon={Banknote}>
        {workingCapitalIndicators.map((config, i) => (
          <IndicatorCard key={i} config={config} />
        ))}
      </IndicatorSection>

      <IndicatorSection title="Movimentação do Período" icon={Target}>
        {movementIndicators.map((config, i) => (
          <IndicatorCard key={i} config={config} />
        ))}
      </IndicatorSection>
    </>
  );
}
