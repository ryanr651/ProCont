import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MetricCard } from "@/components/MetricCard";
import { ProgressBar } from "@/components/ProgressBar";
import {
  ArrowLeft,
  TrendingUp,
  Wallet,
  PiggyBank,
  Building,
  Scale,
  Landmark
} from "lucide-react";

const Showcase = () => {
  // Static showcase data
  const showcaseData = {
    receitaLiquida: 2500000,
    custos: 1800000,
    lucro: 700000,
    margemLiquida: 28,
    ativoTotal: 3200000,
    passivoTotal: 1900000,
    patrimonioLiquido: 1300000
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background effects */}
      <div className="hero-glow w-full h-[400px] top-0 left-0" />

      {/* Navigation */}
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
            <span className="text-sm text-secondary font-medium">
              Exemplo Ilustrativo
            </span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Dashboard de <span className="gradient-text">Análise Financeira</span>
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Este é um exemplo ilustrativo de como o ProCont transforma DRE e Balanço Patrimonial 
            em análises financeiras visuais. Os resultados reais serão exibidos após o envio dos arquivos do usuário.
          </p>
        </div>

        {/* DRE Section */}
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-primary" />
            Demonstração do Resultado (DRE)
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Receita Líquida"
              value={showcaseData.receitaLiquida}
              icon={Wallet}
              variant="highlight"
            />
            <MetricCard
              title="Custos Totais"
              value={showcaseData.custos}
              icon={PiggyBank}
            />
            <MetricCard
              title="Lucro Líquido"
              value={showcaseData.lucro}
              icon={TrendingUp}
              variant="accent"
            />
            <MetricCard
              title="Margem Líquida"
              value={`${showcaseData.margemLiquida}%`}
              subtitle="Excelente performance"
              trend="up"
            />
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
              value={showcaseData.ativoTotal}
              icon={Building}
              variant="highlight"
            />
            <MetricCard
              title="Passivo Total"
              value={showcaseData.passivoTotal}
              icon={Scale}
            />
            <MetricCard
              title="Patrimônio Líquido"
              value={showcaseData.patrimonioLiquido}
              icon={Landmark}
              variant="accent"
            />
          </div>

          {/* Composition Chart */}
          <div className="glass-card p-6">
            <h3 className="font-display font-semibold mb-4">Composição do Balanço</h3>
            <div className="space-y-4">
              <ProgressBar
                label="Ativo Total"
                value={100}
                variant="purple"
              />
              <ProgressBar
                label="Passivo Total"
                value={(showcaseData.passivoTotal / showcaseData.ativoTotal) * 100}
                variant="blue"
              />
              <ProgressBar
                label="Patrimônio Líquido"
                value={(showcaseData.patrimonioLiquido / showcaseData.ativoTotal) * 100}
                variant="gradient"
              />
            </div>
          </div>
        </section>

        {/* Insights Section */}
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold mb-6">Insights Automáticos</h2>
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <span className="text-xl">✅</span>
              <p className="text-foreground">
                Margem líquida excelente de 28%. A empresa demonstra alta eficiência na conversão de receitas em lucro.
              </p>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-xl">📈</span>
              <p className="text-foreground">
                Receita líquida de R$ 2,5 milhões indica operação de médio a grande porte com potencial de crescimento.
              </p>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-secondary/10 border border-secondary/20">
              <span className="text-xl">💰</span>
              <p className="text-foreground">
                Patrimônio líquido representa 40% do ativo total, indicando estrutura de capital equilibrada.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            Pronto para analisar os dados reais do seu cliente?
          </p>
          <Link to="/upload">
            <Button variant="hero" size="xl">
              Enviar Meus Arquivos
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Showcase;
