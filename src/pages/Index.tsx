import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight, BarChart3, FileSpreadsheet, Sparkles, Zap, LogIn, LogOut } from "lucide-react";

const Index = () => {
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="hero-glow w-full h-[600px] top-0 left-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />
      
      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-6 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-4">
          <Link to="/showcase">
            <Button variant="ghost" size="sm">
              Ver Exemplo
            </Button>
          </Link>
          {user ? (
            <>
              <Link to="/empresas">
                <Button variant="ghost" size="sm">
                  Empresas
                </Button>
              </Link>
              <Link to="/upload">
                <Button variant="neon" size="sm">
                  Upload
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            </>
          ) : (
            <Link to="/auth">
              <Button variant="neon" size="sm">
                <LogIn className="w-4 h-4 mr-2" />
                Entrar
              </Button>
            </Link>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 container mx-auto px-6 pt-20 pb-32">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-medium">Análise Financeira com IA</span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>
            Transforme DRE e Balanço em{" "}
            <span className="gradient-text">insights visuais</span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: "0.3s" }}>
            Dashboards financeiros automáticos a partir de arquivos de DRE e Balanço Patrimonial. 
            Análises inteligentes para escritórios contábeis.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 animate-fade-in" style={{ animationDelay: "0.4s" }}>
            <Link to={user ? "/upload" : "/auth"}>
              <Button variant="hero" size="xl" className="group">
                {user ? "Enviar Arquivos" : "Começar Agora"}
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link to="/showcase">
              <Button variant="glass" size="xl">
                Ver Exemplo de Análise
              </Button>
            </Link>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 animate-fade-in" style={{ animationDelay: "0.5s" }}>
            <div className="glass-card p-6 text-left">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <FileSpreadsheet className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">Upload Simples</h3>
              <p className="text-sm text-muted-foreground">
                Envie arquivos CSV, XLS ou XLSX de DRE e Balanço Patrimonial com facilidade.
              </p>
            </div>

            <div className="glass-card p-6 text-left">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-secondary" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">Processamento Rápido</h3>
              <p className="text-sm text-muted-foreground">
                Sistema inteligente que reconhece automaticamente as contas contábeis brasileiras.
              </p>
            </div>

            <div className="glass-card p-6 text-left">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-accent" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">Dashboards Visuais</h3>
              <p className="text-sm text-muted-foreground">
                Indicadores, margens e insights gerados automaticamente em formato visual.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border py-8">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          © 2024 ProCont. Análise financeira inteligente para escritórios contábeis.
        </div>
      </footer>
    </div>
  );
};

export default Index;
