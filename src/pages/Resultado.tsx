import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MetricCard } from "@/components/MetricCard";
import { ProgressBar } from "@/components/ProgressBar";
import { FinancialAnalysis } from "@/lib/fileParser";
import {
  ArrowLeft,
  TrendingUp,
  Wallet,
  PiggyBank,
  Building,
  Scale,
  Landmark,
  RefreshCw,
  Percent,
  DollarSign,
  Receipt,
  Calculator
} from "lucide-react";

const Resultado = () => {
  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedAnalysis = sessionStorage.getItem("fintrix-analysis");
    if (storedAnalysis) {
      setAnalysis(JSON.parse(storedAnalysis));
    } else {
      navigate("/upload");
    }
  }, [navigate]);

  if (!analysis) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando análise...</p>
        </div>
      </div>
    );
  }

  const { dre, balanco, insights } = analysis;

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background effects */}
      <div className="hero-glow w-full h-[400px] top-0 left-0" />

      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-6 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-4">
          <Link to="/upload">
            <Button variant="ghost" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Nova Análise
            </Button>
          </Link>
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

        {/* DRE Section */}
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-primary" />
            Demonstração do Resultado (DRE)
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              title="Receita Bruta"
              value={dre.receitaBruta}
              icon={DollarSign}
              variant="highlight"
            />
            <MetricCard
              title="Receita Líquida"
              value={dre.receitaLiquida}
              icon={Wallet}
            />
            <MetricCard
              title="CMV / Custos"
              value={dre.cmv}
              icon={Receipt}
            />
            <MetricCard
              title="Lucro Bruto"
              value={dre.lucroBruto}
              icon={PiggyBank}
              variant="accent"
            />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              title="Despesas Operacionais"
              value={dre.despesasOperacionais}
              icon={Calculator}
            />
            <MetricCard
              title="Lucro Operacional"
              value={dre.lucroOperacional}
              icon={TrendingUp}
            />
            <MetricCard
              title="Resultado Financeiro"
              value={dre.resultadoFinanceiro}
              icon={Scale}
            />
            <MetricCard
              title="Lucro Líquido"
              value={dre.lucroLiquido}
              icon={TrendingUp}
              variant="highlight"
            />
          </div>

          {/* Margins */}
          <div className="glass-card p-6">
            <h3 className="font-display font-semibold mb-4">Margens</h3>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <ProgressBar
                  label="Margem Bruta"
                  value={dre.margemBruta}
                  variant="purple"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {dre.margemBruta.toFixed(2)}%
                </p>
              </div>
              <div>
                <ProgressBar
                  label="Margem Operacional"
                  value={dre.margemOperacional}
                  variant="blue"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {dre.margemOperacional.toFixed(2)}%
                </p>
              </div>
              <div>
                <ProgressBar
                  label="Margem Líquida"
                  value={dre.margemLiquida}
                  variant="gradient"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {dre.margemLiquida.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Balance Sheet Section */}
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
            <Scale className="w-6 h-6 text-secondary" />
            Balanço Patrimonial
          </h2>

          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <MetricCard
              title="Ativo Total"
              value={balanco.ativoTotal}
              icon={Building}
              variant="highlight"
            />
            <MetricCard
              title="Passivo Total"
              value={balanco.passivoTotal}
              icon={Scale}
            />
            <MetricCard
              title="Patrimônio Líquido"
              value={balanco.patrimonioLiquido}
              icon={Landmark}
              variant="accent"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Ativo Breakdown */}
            <div className="glass-card p-6">
              <h3 className="font-display font-semibold mb-4">Composição do Ativo</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Ativo Circulante</span>
                    <span className="text-foreground">
                      {balanco.ativoCirculante.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                    </span>
                  </div>
                  <ProgressBar
                    value={balanco.ativoTotal > 0 ? (balanco.ativoCirculante / balanco.ativoTotal) * 100 : 0}
                    showPercentage={false}
                    variant="purple"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Ativo Não Circulante</span>
                    <span className="text-foreground">
                      {balanco.ativoNaoCirculante.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                    </span>
                  </div>
                  <ProgressBar
                    value={balanco.ativoTotal > 0 ? (balanco.ativoNaoCirculante / balanco.ativoTotal) * 100 : 0}
                    showPercentage={false}
                    variant="blue"
                  />
                </div>
              </div>
            </div>

            {/* Passivo Breakdown */}
            <div className="glass-card p-6">
              <h3 className="font-display font-semibold mb-4">Estrutura de Capital</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Passivo Circulante</span>
                    <span className="text-foreground">
                      {balanco.passivoCirculante.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                    </span>
                  </div>
                  <ProgressBar
                    value={balanco.ativoTotal > 0 ? (balanco.passivoCirculante / balanco.ativoTotal) * 100 : 0}
                    showPercentage={false}
                    variant="purple"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Passivo Não Circulante</span>
                    <span className="text-foreground">
                      {balanco.passivoNaoCirculante.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                    </span>
                  </div>
                  <ProgressBar
                    value={balanco.ativoTotal > 0 ? (balanco.passivoNaoCirculante / balanco.ativoTotal) * 100 : 0}
                    showPercentage={false}
                    variant="blue"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Patrimônio Líquido</span>
                    <span className="text-foreground">
                      {balanco.patrimonioLiquido.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                    </span>
                  </div>
                  <ProgressBar
                    value={balanco.ativoTotal > 0 ? (balanco.patrimonioLiquido / balanco.ativoTotal) * 100 : 0}
                    showPercentage={false}
                    variant="gradient"
                  />
                </div>
              </div>
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
    </div>
  );
};

export default Resultado;
