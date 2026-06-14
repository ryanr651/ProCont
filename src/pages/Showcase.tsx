import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IndicatorCard, IndicatorSection, type IndicatorConfig } from "@/components/IndicatorCard";
import { FaturamentoAnalysis, type FaturamentoRow } from "@/components/FaturamentoAnalysis";
import { Sparkles, Presentation, MessageSquare, BarChart3 as BarChartIcon } from "lucide-react";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Building,
  Scale,
  Landmark,
  DollarSign,
  Receipt,
  Calculator,
  Percent,
  ShieldCheck,
  Activity,
  Target,
  BarChart3,
  Clock,
  Timer,
  ArrowRightLeft,
  Banknote,
  Factory,
} from "lucide-react";

const Showcase = () => {
  // ===== Static showcase data =====
  const dre = {
    receitaBruta: 3200000,
    receitaLiquida: 2500000,
    cmv: -1400000,
    lucroBruto: 1100000,
    despesasOperacionais: -520000,
    lucroOperacional: 580000,
    resultadoFinanceiro: -30000,
    ebitda: 640000,
    lucroLiquido: 420000,
    margemBruta: 44,
    margemOperacional: 23.2,
    margemLiquida: 16.8,
    margemEbitda: 25.6,
  };

  const balanco = {
    ativoCirculante: 1800000,
    ativoNaoCirculante: 1400000,
    ativoTotal: 3200000,
    passivoCirculante: 900000,
    passivoNaoCirculante: 600000,
    passivoTotal: 1500000,
    patrimonioLiquido: 1700000,
  };

  const liquidezCorrente = balanco.ativoCirculante / balanco.passivoCirculante;
  const liquidezSeca = (balanco.ativoCirculante - 320000) / balanco.passivoCirculante;
  const endividamentoGeral = (balanco.passivoTotal / balanco.ativoTotal) * 100;
  const composicaoEndividamento = (balanco.passivoCirculante / balanco.passivoTotal) * 100;
  const roe = (dre.lucroLiquido / balanco.patrimonioLiquido) * 100;
  const roa = (dre.lucroLiquido / balanco.ativoTotal) * 100;

  // Balancete static data
  const pmr = 38;
  const pmp = 42;
  const pme = 25;
  const cicloFinanceiro = pmr + pme - pmp;
  const ncg = 180000;
  const saldoTesouraria = 450000;
  const capitalGiro = balanco.ativoCirculante - balanco.passivoCirculante;
  const imobilizacaoPL = 52.9;

  // ===== DRE Indicators =====
  const dreIndicators: IndicatorConfig[] = [
    { title: "Receita Bruta", value: dre.receitaBruta, format: "currency", icon: DollarSign, variant: "highlight", formula: "Σ Contas de Receita Bruta", formulaDescription: "Soma de todas as receitas operacionais brutas.", accounts: [{ descricao: "Vendas de Mercadorias", valor: 2800000, motivo: "Receita principal" }, { descricao: "Prestação de Serviços", valor: 400000, motivo: "Receita secundária" }], subtitle: "Linha explícita" },
    { title: "Receita Líquida", value: dre.receitaLiquida, format: "currency", icon: Wallet, formula: "Receita Bruta − Deduções", formulaDescription: "Receita bruta menos impostos sobre vendas, devoluções e abatimentos.", accounts: [{ descricao: "Receita Bruta", valor: 3200000, motivo: "Base" }, { descricao: "Deduções e Impostos", valor: -700000, motivo: "PIS, COFINS, ISS, ICMS" }] },
    { title: "CMV / Custos", value: dre.cmv, format: "currency", icon: Receipt, formula: "Σ Custos das Mercadorias/Serviços", formulaDescription: "Custo das mercadorias vendidas ou serviços prestados.", accounts: [{ descricao: "CMV", valor: -1400000, motivo: "Custo direto" }], trend: "down" },
    { title: "Lucro Bruto", value: dre.lucroBruto, format: "currency", icon: PiggyBank, variant: "accent", formula: "Receita Líquida − CMV", formulaDescription: "Resultado da receita líquida deduzida dos custos diretos.", accounts: [{ descricao: "Receita Líquida", valor: 2500000, motivo: "Base" }, { descricao: "CMV", valor: -1400000, motivo: "Custos diretos" }] },
    { title: "EBITDA", value: dre.ebitda, format: "currency", icon: BarChart3, variant: "highlight", formula: "Lucro Operacional + Depreciação + Amortização", formulaDescription: "Lucro antes de juros, impostos, depreciação e amortização.", accounts: [{ descricao: "Lucro Operacional", valor: 580000, motivo: "Base do EBITDA" }, { descricao: "Depreciação", valor: 60000, motivo: "Adicionado de volta" }], subtitle: `Margem EBITDA: ${dre.margemEbitda.toFixed(1)}%` },
    { title: "Despesas Operacionais", value: dre.despesasOperacionais, format: "currency", icon: Calculator, formula: "Σ Despesas Administrativas + Trabalhistas + Gerais", formulaDescription: "Total de despesas com a operação.", accounts: [{ descricao: "Despesas Administrativas", valor: -280000, motivo: "Administrativo" }, { descricao: "Despesas Trabalhistas", valor: -180000, motivo: "Salários e encargos" }, { descricao: "Despesas Gerais", valor: -60000, motivo: "Materiais e serviços" }] },
    { title: "Lucro Operacional", value: dre.lucroOperacional, format: "currency", icon: TrendingUp, formula: "Lucro Bruto − Despesas Operacionais", formulaDescription: "Resultado das operações antes de receitas/despesas financeiras.", accounts: [{ descricao: "Lucro Bruto", valor: 1100000, motivo: "Base" }, { descricao: "Despesas Operacionais", valor: -520000, motivo: "Deduzidas" }] },
    { title: "Lucro Líquido", value: dre.lucroLiquido, format: "currency", icon: Target, variant: "success", formula: "Lucro Operacional ± Resultado Financeiro − IR − CSLL", formulaDescription: "Resultado final após todas as deduções.", accounts: [{ descricao: "Lucro Operacional", valor: 580000, motivo: "Base" }, { descricao: "Resultado Financeiro", valor: -30000, motivo: "Juros e taxas" }, { descricao: "IR/CSLL", valor: -130000, motivo: "Tributos sobre o lucro" }], trend: "up" },
  ];

  // ===== Margin Indicators =====
  const marginIndicators: IndicatorConfig[] = [
    { title: "Margem Bruta", value: dre.margemBruta, format: "percentage", icon: Percent, variant: "success", formula: "(Lucro Bruto ÷ Receita Líquida) × 100", formulaDescription: "Percentual de lucro após custos diretos.", accounts: [{ descricao: "Lucro Bruto", valor: dre.lucroBruto, motivo: "Numerador" }, { descricao: "Receita Líquida", valor: dre.receitaLiquida, motivo: "Denominador" }], trend: "up" },
    { title: "Margem Operacional", value: dre.margemOperacional, format: "percentage", icon: Percent, variant: "success", formula: "(Lucro Operacional ÷ Receita Líquida) × 100", formulaDescription: "Eficiência operacional.", accounts: [{ descricao: "Lucro Operacional", valor: dre.lucroOperacional, motivo: "Numerador" }, { descricao: "Receita Líquida", valor: dre.receitaLiquida, motivo: "Denominador" }] },
    { title: "Margem Líquida", value: dre.margemLiquida, format: "percentage", icon: Percent, variant: "success", formula: "(Lucro Líquido ÷ Receita Líquida) × 100", formulaDescription: "Percentual final que efetivamente vira lucro.", accounts: [{ descricao: "Lucro Líquido", valor: dre.lucroLiquido, motivo: "Numerador" }, { descricao: "Receita Líquida", valor: dre.receitaLiquida, motivo: "Denominador" }], trend: "up" },
    { title: "Margem EBITDA", value: dre.margemEbitda, format: "percentage", icon: BarChart3, variant: "success", formula: "(EBITDA ÷ Receita Líquida) × 100", formulaDescription: "Capacidade de geração de caixa operacional.", accounts: [{ descricao: "EBITDA", valor: dre.ebitda, motivo: "Numerador" }, { descricao: "Receita Líquida", valor: dre.receitaLiquida, motivo: "Denominador" }] },
  ];

  // ===== Balanço Indicators =====
  const balancoIndicators: IndicatorConfig[] = [
    { title: "Ativo Total", value: balanco.ativoTotal, format: "currency", icon: Building, variant: "highlight", formula: "Ativo Circulante + Ativo Não Circulante", formulaDescription: "Total de bens e direitos da empresa.", accounts: [{ descricao: "Ativo Circulante", valor: balanco.ativoCirculante, motivo: "Bens de curto prazo" }, { descricao: "Ativo Não Circulante", valor: balanco.ativoNaoCirculante, motivo: "Bens de longo prazo" }] },
    { title: "Passivo Total", value: balanco.passivoTotal, format: "currency", icon: Scale, formula: "Passivo Circulante + Passivo Não Circulante", formulaDescription: "Total de obrigações com terceiros.", accounts: [{ descricao: "Passivo Circulante", valor: balanco.passivoCirculante, motivo: "Curto prazo" }, { descricao: "Passivo Não Circulante", valor: balanco.passivoNaoCirculante, motivo: "Longo prazo" }] },
    { title: "Patrimônio Líquido", value: balanco.patrimonioLiquido, format: "currency", icon: Landmark, variant: "accent", formula: "Ativo Total − Passivo Total", formulaDescription: "Recursos próprios dos sócios.", accounts: [{ descricao: "Ativo Total", valor: balanco.ativoTotal, motivo: "Total de bens" }, { descricao: "Passivo Total", valor: -balanco.passivoTotal, motivo: "Menos obrigações" }] },
  ];

  // ===== Solvência & Rentabilidade =====
  const solvenciaIndicators: IndicatorConfig[] = [
    { title: "Liquidez Corrente", value: liquidezCorrente, format: "ratio", icon: Activity, variant: "success", formula: "Ativo Circulante ÷ Passivo Circulante", formulaDescription: "Capacidade de pagar dívidas de curto prazo. Ideal > 1,5.", accounts: [{ descricao: "Ativo Circulante", valor: balanco.ativoCirculante, motivo: "Numerador" }, { descricao: "Passivo Circulante", valor: balanco.passivoCirculante, motivo: "Denominador" }], trend: "up", subtitle: "Saudável" },
    { title: "Liquidez Seca", value: liquidezSeca, format: "ratio", icon: ShieldCheck, variant: "success", formula: "(Ativo Circulante − Estoques) ÷ Passivo Circulante", formulaDescription: "Capacidade de pagamento sem depender de estoques. Ideal > 1.", accounts: [{ descricao: "Ativo Circulante", valor: balanco.ativoCirculante, motivo: "Base" }, { descricao: "Estoques (deduzidos)", valor: -320000, motivo: "Removido" }, { descricao: "Passivo Circulante", valor: balanco.passivoCirculante, motivo: "Denominador" }] },
    { title: "Endividamento Geral", value: endividamentoGeral, format: "percentage", icon: TrendingDown, variant: "success", formula: "(Passivo Total ÷ Ativo Total) × 100", formulaDescription: "Quanto dos ativos é financiado por terceiros. Ideal < 60%.", accounts: [{ descricao: "Passivo Total", valor: balanco.passivoTotal, motivo: "Numerador" }, { descricao: "Ativo Total", valor: balanco.ativoTotal, motivo: "Denominador" }], trend: "up" },
    { title: "Composição Endividamento", value: composicaoEndividamento, format: "percentage", icon: Scale, variant: "danger", formula: "Passivo Circulante ÷ Passivo Total × 100", formulaDescription: "Quanto da dívida vence no curto prazo. Ideal < 50%.", accounts: [{ descricao: "Passivo Circulante", valor: balanco.passivoCirculante, motivo: "Curto prazo" }, { descricao: "Passivo Não Circulante", valor: balanco.passivoNaoCirculante, motivo: "Longo prazo" }] },
    { title: "ROE", value: roe, format: "percentage", icon: Target, variant: "success", formula: "(Lucro Líquido ÷ Patrimônio Líquido) × 100", formulaDescription: "Retorno sobre o capital dos sócios.", accounts: [{ descricao: "Lucro Líquido", valor: dre.lucroLiquido, motivo: "Numerador" }, { descricao: "Patrimônio Líquido", valor: balanco.patrimonioLiquido, motivo: "Denominador" }], trend: "up" },
    { title: "ROA", value: roa, format: "percentage", icon: Activity, variant: "success", formula: "(Lucro Líquido ÷ Ativo Total) × 100", formulaDescription: "Retorno sobre os ativos totais.", accounts: [{ descricao: "Lucro Líquido", valor: dre.lucroLiquido, motivo: "Numerador" }, { descricao: "Ativo Total", valor: balanco.ativoTotal, motivo: "Denominador" }] },
  ];

  // ===== Balancete: Estrutura Patrimonial =====
  const balanceteStructure: IndicatorConfig[] = [
    { title: "Ativo Total", value: 3200000, format: "currency", icon: Building, variant: "highlight", formula: "Ativo Circulante + Ativo Não Circulante", formulaDescription: "Soma de todos os bens e direitos da empresa extraídos do balancete.", accounts: [{ descricao: "Caixa e Bancos", valor: 450000, motivo: "DISPONIBILIDADES" }, { descricao: "Clientes", valor: 380000, motivo: "CONTAS_A_RECEBER" }, { descricao: "Estoques", valor: 320000, motivo: "ESTOQUE" }, { descricao: "Imobilizado", valor: 1200000, motivo: "IMOBILIZADO" }, { descricao: "(-) Depreciação Acumulada", valor: -350000, motivo: "Conta redutora", isRedutora: true }] },
    { title: "Passivo Total", value: 1500000, format: "currency", icon: Scale, formula: "Passivo Circulante + Passivo Não Circulante", formulaDescription: "Soma de todas as obrigações com terceiros.", accounts: [{ descricao: "Passivo Circulante", valor: 900000, motivo: "Curto prazo" }, { descricao: "Passivo Não Circulante", valor: 600000, motivo: "Longo prazo" }] },
    { title: "Patrimônio Líquido", value: 1700000, format: "currency", icon: Landmark, variant: "accent", formula: "Capital Social + Reservas + Lucros Acumulados", formulaDescription: "Recursos próprios dos sócios no balancete.", accounts: [{ descricao: "Capital Social", valor: 1000000, motivo: "CAPITAL_SOCIAL" }, { descricao: "Reservas de Lucros", valor: 280000, motivo: "RESERVA" }, { descricao: "Lucros Acumulados", valor: 420000, motivo: "LUCROS_ACUMULADOS" }] },
  ];

  // ===== Balancete: Liquidez e Solvência =====
  const balanceteSolvencia: IndicatorConfig[] = [
    { title: "Liquidez Corrente", value: 2.0, format: "ratio", icon: Activity, variant: "success", formula: "Ativo Circulante ÷ Passivo Circulante", formulaDescription: "Capacidade de pagar dívidas de curto prazo. Ideal > 1,5.", accounts: [{ descricao: "Ativo Circulante", valor: 1800000, motivo: "Numerador" }, { descricao: "Passivo Circulante", valor: 900000, motivo: "Denominador" }], trend: "up", subtitle: "Saudável" },
    { title: "Liquidez Seca", value: 1.64, format: "ratio", icon: ShieldCheck, variant: "success", formula: "(AC − Estoques) ÷ Passivo Circulante", formulaDescription: "Sem depender da venda de estoques. Ideal > 1.", accounts: [{ descricao: "Ativo Circulante", valor: 1800000, motivo: "Base" }, { descricao: "Estoques (deduzidos)", valor: -320000, motivo: "Removido" }, { descricao: "Passivo Circulante", valor: 900000, motivo: "Denominador" }] },
    { title: "Grau de Endividamento", value: 0.88, format: "ratio", icon: TrendingDown, variant: "success", formula: "Passivo Total ÷ Patrimônio Líquido", formulaDescription: "Relação entre capital de terceiros e capital próprio. Ideal < 1.", accounts: [{ descricao: "Passivo Total", valor: 1500000, motivo: "Numerador" }, { descricao: "Patrimônio Líquido", valor: 1700000, motivo: "Denominador" }], trend: "up" },
    { title: "Capital de Giro Líquido", value: capitalGiro, format: "currency", icon: Wallet, variant: "success", formula: "Ativo Circulante − Passivo Circulante", formulaDescription: "Recursos de curto prazo disponíveis após pagar obrigações.", accounts: [{ descricao: "Ativo Circulante", valor: 1800000, motivo: "Recursos" }, { descricao: "Passivo Circulante", valor: -900000, motivo: "Obrigações" }], trend: "up" },
    { title: "Composição do Endividamento", value: 60, format: "percentage", icon: Scale, variant: "warning", formula: "(Passivo Circulante ÷ Passivo Total) × 100", formulaDescription: "Quanto da dívida vence no curto prazo. Ideal < 50%.", accounts: [{ descricao: "Passivo Circulante", valor: 900000, motivo: "Curto prazo" }, { descricao: "Passivo Não Circulante", valor: 600000, motivo: "Longo prazo" }] },
    { title: "Imobilização do PL", value: imobilizacaoPL, format: "percentage", icon: Factory, variant: "warning", formula: "(Ativo Imobilizado ÷ Patrimônio Líquido) × 100", formulaDescription: "Quanto do capital próprio está investido em ativos fixos.", accounts: [{ descricao: "Ativo Imobilizado", valor: 900000, motivo: "Imobilizado líquido" }, { descricao: "Patrimônio Líquido", valor: 1700000, motivo: "Denominador" }] },
  ];

  // ===== Balancete: Prazos Médios =====
  const prazosMedios: IndicatorConfig[] = [
    { title: "PMR (Prazo Médio de Recebimento)", value: pmr, format: "ratio", icon: Clock, variant: "success", formula: "Média de Clientes ÷ (Receita Bruta Mensal ÷ 30)", formulaDescription: "Prazo médio para receber dos clientes.", accounts: [{ descricao: "Contas a Receber", valor: 380000, motivo: "Saldo médio" }, { descricao: "Receita Bruta Anual", valor: 3200000, motivo: "Dividido por 360" }], subtitle: `${pmr} dias` },
    { title: "PMP (Prazo Médio de Pagamento)", value: pmp, format: "ratio", icon: Timer, variant: "success", formula: "Média de Fornecedores ÷ (CMV Mensal ÷ 30)", formulaDescription: "Prazo médio para pagar fornecedores.", accounts: [{ descricao: "Fornecedores", valor: 220000, motivo: "Saldo médio" }, { descricao: "CMV Anual", valor: 1400000, motivo: "Dividido por 360" }], subtitle: `${pmp} dias` },
    { title: "PME (Prazo Médio de Estoques)", value: pme, format: "ratio", icon: ArrowRightLeft, variant: "success", formula: "Estoques ÷ (CMV Mensal ÷ 30)", formulaDescription: "Tempo médio de permanência do estoque.", accounts: [{ descricao: "Estoques", valor: 320000, motivo: "Saldo" }, { descricao: "CMV Anual", valor: 1400000, motivo: "Dividido por 360" }], subtitle: `${pme} dias` },
    { title: "Ciclo Financeiro", value: cicloFinanceiro, format: "ratio", icon: BarChart3, variant: "success", formula: "PMR + PME − PMP", formulaDescription: `Tempo médio entre pagamento ao fornecedor e recebimento do cliente. ${pmr}d + ${pme}d − ${pmp}d = ${cicloFinanceiro} dias.`, accounts: [{ descricao: "PMR", valor: pmr, motivo: `${pmr} dias` }, { descricao: "PME", valor: pme, motivo: `${pme} dias` }, { descricao: "PMP", valor: -pmp, motivo: `${pmp} dias (deduzido)` }], subtitle: `${cicloFinanceiro} dias`, trend: "up" },
  ];

  // ===== Balancete: Capital de Giro e Tesouraria =====
  const workingCapital: IndicatorConfig[] = [
    { title: "NCG (Necessidade de Capital de Giro)", value: ncg, format: "currency", icon: Banknote, variant: "warning", formula: "Ativo Circulante Operacional − Passivo Circulante Operacional", formulaDescription: "Recursos necessários para financiar o ciclo operacional.", accounts: [{ descricao: "Contas a Receber", valor: 380000, motivo: "AC Operacional" }, { descricao: "Estoques", valor: 320000, motivo: "AC Operacional" }, { descricao: "Fornecedores", valor: -220000, motivo: "PC Operacional" }, { descricao: "Obrigações Trabalhistas", valor: -150000, motivo: "PC Operacional" }, { descricao: "Impostos a Pagar", valor: -150000, motivo: "PC Operacional" }], trend: "down" },
    { title: "Saldo de Tesouraria", value: saldoTesouraria, format: "currency", icon: Wallet, variant: "success", formula: "Ativo Circulante Financeiro − Passivo Circulante Financeiro", formulaDescription: "Diferença entre disponibilidades e empréstimos de curto prazo.", accounts: [{ descricao: "Disponibilidades", valor: 450000, motivo: "Caixa e bancos" }], trend: "up" },
  ];

  return (
    <div className="min-h-screen bg-background relative">
      <div className="hero-glow w-full h-[400px] top-0 left-0" />

      <nav className="relative z-10 container mx-auto px-6 py-6 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </Link>
          <Link to="/upload">
            <Button variant="neon" size="sm">
              Enviar Meus Arquivos
            </Button>
          </Link>
        </div>
      </nav>

      <main className="relative z-10 container mx-auto px-6 py-12">
        {/* Header */}
        <div className="max-w-4xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 border border-secondary/20 mb-6">
            <span className="text-sm text-secondary font-medium">Exemplo Ilustrativo</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Dashboard de <span className="gradient-text">Análise Financeira</span>
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Este é um exemplo ilustrativo de como o KlarCont transforma DRE, Balanço Patrimonial e Balancete
            em análises financeiras visuais com indicadores detalhados.
          </p>
        </div>

        {/* DRE */}
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

        {/* Balanço Patrimonial */}
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

        {/* Balancete: Estrutura Patrimonial */}
        <IndicatorSection title="Estrutura Patrimonial (Balancete)" icon={Building}>
          {balanceteStructure.map((config, i) => (
            <IndicatorCard key={i} config={config} />
          ))}
        </IndicatorSection>

        {/* Balancete: Liquidez e Solvência */}
        <IndicatorSection title="Indicadores de Liquidez e Solvência" icon={ShieldCheck}>
          {balanceteSolvencia.map((config, i) => (
            <IndicatorCard key={i} config={config} />
          ))}
        </IndicatorSection>

        {/* Balancete: Prazos Médios */}
        <IndicatorSection title="Prazos Médios (Atividade)" icon={Clock}>
          {prazosMedios.map((config, i) => (
            <IndicatorCard key={i} config={config} />
          ))}
        </IndicatorSection>

        {/* Balancete: Capital de Giro */}
        <IndicatorSection title="Capital de Giro e Tesouraria" icon={Banknote}>
          {workingCapital.map((config, i) => (
            <IndicatorCard key={i} config={config} />
          ))}
        </IndicatorSection>

        {/* Insights */}
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold mb-6">Insights Automáticos</h2>
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-xl">✅</span>
              <p className="text-foreground">Margem líquida de 16,8% indica boa conversão de receita em lucro líquido.</p>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-xl">📈</span>
              <p className="text-foreground">Liquidez corrente de 2,0 demonstra capacidade sólida de honrar compromissos de curto prazo.</p>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-secondary/10 border border-secondary/20">
              <span className="text-xl">💰</span>
              <p className="text-foreground">Ciclo financeiro de {cicloFinanceiro} dias indica eficiência na gestão do capital de giro.</p>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-xl">⚠️</span>
              <p className="text-foreground">Composição do endividamento de 60% concentrada no curto prazo merece atenção para renegociação de prazos.</p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Pronto para analisar os dados reais do seu cliente?</p>
          <Link to="/upload">
            <Button variant="hero" size="xl">Enviar Meus Arquivos</Button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Showcase;
