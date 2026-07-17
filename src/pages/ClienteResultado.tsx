import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { DashboardIndicadores } from "@/components/DashboardIndicadores";
import { DashboardBalancete, type BalanceteClassifiedEntry } from "@/components/DashboardBalancete";
import { BalanceteComparativo } from "@/components/BalanceteComparativo";
import { FaturamentoAnalysis, type FaturamentoRow } from "@/components/FaturamentoAnalysis";
import { LogOut, Loader2, Eye, BarChart3, CalendarDays } from "lucide-react";

const TOKEN_KEY = (id: string) => `klarcont_client_token_${id}`;

const getDREGroupColor = (grupo: string): string => {
  const colors: Record<string, string> = {
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
  return colors[grupo] || "bg-muted text-muted-foreground border-border";
};

const getDREGroupLabel = (grupo: string): string => {
  const labels: Record<string, string> = {
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
  return labels[grupo] || grupo;
};

export default function ClienteResultado() {
  const { empresaId } = useParams<{ empresaId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);

  useEffect(() => {
    if (!empresaId) return;
    const raw = sessionStorage.getItem(TOKEN_KEY(empresaId));
    if (!raw) {
      navigate(`/visualizar/${empresaId}`, { replace: true });
      return;
    }
    let token: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.expires_at && parsed.expires_at * 1000 > Date.now()) {
        token = parsed.token;
      }
    } catch {}
    if (!token) {
      sessionStorage.removeItem(TOKEN_KEY(empresaId));
      navigate(`/visualizar/${empresaId}`, { replace: true });
      return;
    }

    (async () => {
      const { data, error: invErr } = await supabase.functions.invoke("client-portal", {
        body: { action: "data", empresa_id: empresaId, token },
      });
      if (invErr || data?.error) {
        sessionStorage.removeItem(TOKEN_KEY(empresaId));
        navigate(`/visualizar/${empresaId}`, { replace: true });
        return;
      }
      setEmpresa(data.empresa);
      setSnapshot(data.snapshot);
      setLoading(false);
    })().catch((e) => {
      setError(e.message || "Erro ao carregar dados");
      setLoading(false);
    });
  }, [empresaId, navigate]);

  const handleLogout = () => {
    if (empresaId) sessionStorage.removeItem(TOKEN_KEY(empresaId));
    navigate(`/visualizar/${empresaId}`, { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-destructive">{error}</div>;
  }

  if (!snapshot || !snapshot.dreData || !snapshot.balancoData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="font-display text-xl font-bold">Análise ainda não disponível</h1>
          <p className="text-sm text-muted-foreground">
            O seu contador ainda não publicou a análise desta empresa. Tente novamente em alguns instantes.
          </p>
          <Button variant="outline" onClick={handleLogout} className="mt-4">Sair</Button>
        </div>
      </div>
    );
  }

  const balanceteEntries: BalanceteClassifiedEntry[] = snapshot.balanceteEntries || [];
  const previousPeriods: any[] = snapshot.previousPeriods || [];
  const faturamentoData: FaturamentoRow[] = snapshot.faturamentoData || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Logo size="sm" />
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground truncate">{empresa?.nome}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                <Eye className="w-3 h-3" /> Somente leitura
              </span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-10">
        <div>
          <h1 className="font-display text-3xl font-bold mb-2">
            Resultado da <span className="gradient-text">Análise Financeira</span>
          </h1>
          <p className="text-muted-foreground">
            {empresa?.nome} — Visualização do Cliente (Somente Leitura)
          </p>
        </div>

        {/* Dashboard de indicadores */}
        <DashboardIndicadores
          dreData={snapshot.dreData}
          balancoData={snapshot.balancoData}
          dreClassifiedEntries={snapshot.dreClassifiedEntries || []}
          rawBalancoEntries={snapshot.rawBalancoEntries || []}
          getDREGroupColor={getDREGroupColor}
          getDREGroupLabel={getDREGroupLabel}
        />

        {/* Balancete */}
        {balanceteEntries.length > 0 && (
          <>
            <DashboardBalancete
              entries={balanceteEntries}
              previousPeriods={previousPeriods.map((p) => ({ ano: p.ano, entries: p.entries }))}
              dreReceitaBruta={snapshot.dreData?.receitaBruta}
              dreCMV={snapshot.dreData?.cmv}
            />

            {previousPeriods.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-display text-2xl font-bold flex items-center gap-3">
                    <BarChart3 className="w-6 h-6 text-primary" />
                    Análise Comparativa (AV / AH)
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {previousPeriods.map((p, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary font-medium"
                    >
                      <CalendarDays className="w-3 h-3" />
                      {p.ano} ({p.entries.length} contas)
                    </span>
                  ))}
                </div>
                <BalanceteComparativo
                  currentEntries={balanceteEntries}
                  currentPeriodo={snapshot.balancetePeriodo || ""}
                  previousPeriods={previousPeriods}
                />
              </section>
            )}
          </>
        )}

        {/* Faturamento */}
        {faturamentoData.length > 0 && (
          <section>
            <h2 className="font-display text-2xl font-bold mb-4">Faturamento Mensal</h2>
            <FaturamentoAnalysis data={faturamentoData} />
          </section>
        )}

        <footer className="border-t pt-6 text-center text-xs text-muted-foreground">
          Visualização gerada por KlarCont — somente leitura
        </footer>
      </main>
    </div>
  );
}