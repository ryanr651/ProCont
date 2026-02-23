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
} from "lucide-react";
import { IndicatorCard, IndicatorSection, type IndicatorConfig, type AccountDetail } from "@/components/IndicatorCard";

export interface BalanceteClassifiedEntry {
  conta: string;
  grupo: string;
  saldo_anterior: number;
  debitos: number;
  creditos: number;
  saldo_atual: number;
  natureza: string;
}

interface DashboardBalanceteProps {
  entries: BalanceteClassifiedEntry[];
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

export function DashboardBalancete({ entries }: DashboardBalanceteProps) {
  const data = useMemo(() => {
    // Aggregate balancete accounts into financial groups
    const ativoCirculante = sumByGrupo(entries, ["DISPONIBILIDADES", "CAIXA", "BANCO", "CONTAS_A_RECEBER", "CLIENTES", "ESTOQUE", "ATIVO_CIRCULANTE", "APLICAC"]);
    const estoques = sumByGrupo(entries, ["ESTOQUE"]);
    const ativoNaoCirculante = sumByGrupo(entries, ["ATIVO_NAO_CIRCULANTE", "IMOBILIZADO", "INTANGIVEL", "INVESTIMENTO", "REALIZAVEL"]);
    const ativoTotal = ativoCirculante + ativoNaoCirculante;
    
    const passivoCirculante = sumByGrupo(entries, ["FORNECEDOR", "OBRIGAC", "PASSIVO_CIRCULANTE", "EMPRESTIMO_CP", "SALARIOS_A_PAGAR", "IMPOSTOS_A_PAGAR", "PROVISAO_CP"]);
    const passivoNaoCirculante = sumByGrupo(entries, ["PASSIVO_NAO_CIRCULANTE", "EMPRESTIMO_LP", "FINANCIAMENTO_LP", "PROVISAO_LP"]);
    const passivoTotal = passivoCirculante + passivoNaoCirculante;
    const patrimonioLiquido = sumByGrupo(entries, ["PATRIMONIO", "CAPITAL_SOCIAL", "RESERVA", "LUCROS_ACUMULADOS", "PREJUIZOS"]);
    
    return { ativoCirculante, ativoNaoCirculante, ativoTotal, estoques, passivoCirculante, passivoNaoCirculante, passivoTotal, patrimonioLiquido };
  }, [entries]);

  const liquidezCorrente = data.passivoCirculante > 0 ? data.ativoCirculante / data.passivoCirculante : 0;
  const liquidezSeca = data.passivoCirculante > 0 ? (data.ativoCirculante - data.estoques) / data.passivoCirculante : 0;
  const endividamento = data.patrimonioLiquido > 0 ? data.passivoTotal / data.patrimonioLiquido : 0;
  const capitalGiro = data.ativoCirculante - data.passivoCirculante;
  const composicaoEndiv = data.passivoTotal > 0 ? (data.passivoCirculante / data.passivoTotal) * 100 : 0;

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

      <IndicatorSection title="Movimentação do Período" icon={Target}>
        {movementIndicators.map((config, i) => (
          <IndicatorCard key={i} config={config} />
        ))}
      </IndicatorSection>
    </>
  );
}
