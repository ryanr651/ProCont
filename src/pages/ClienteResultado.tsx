import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { FaturamentoAnalysis, type FaturamentoRow } from "@/components/FaturamentoAnalysis";
import { LogOut, Loader2, Eye, TrendingUp, TrendingDown, Wallet, Building, Receipt } from "lucide-react";

const TOKEN_KEY = (id: string) => `klarcont_client_token_${id}`;

interface DREEntry { descricao: string; valor: number; valor_anterior: number | null; grupo?: string | null; }
interface BalancoEntry { conta: string; tipo: string; valor: number; valor_anterior: number | null; hierarchy?: string; natureza?: string | null; }
interface BalanceteEntry { conta: string; grupo: string; saldo_anterior: number; debitos: number; creditos: number; saldo_atual: number; natureza?: string | null; }

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);

export default function ClienteResultado() {
  const { empresaId } = useParams<{ empresaId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<{ nome: string; cnpj?: string } | null>(null);
  const [dre, setDre] = useState<DREEntry[]>([]);
  const [balanco, setBalanco] = useState<BalancoEntry[]>([]);
  const [balancete, setBalancete] = useState<BalanceteEntry[]>([]);
  const [faturamento, setFaturamento] = useState<FaturamentoRow[]>([]);

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
      setDre(data.dre);
      setBalanco(data.balanco);
      setBalancete(data.balancete);
      setFaturamento(
        (data.faturamento || []).map((f: any) => ({
          mes: f.mes, ano: f.ano,
          saidas: Number(f.saidas) || 0, servicos: Number(f.servicos) || 0,
          outros: Number(f.outros) || 0, total: Number(f.total) || 0,
        })),
      );
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

  const kpis = useMemo(() => {
    const find = (re: RegExp) => dre.find((d) => re.test(d.descricao || ""))?.valor || 0;
    const receitaLiquida = find(/receita\s+l[ií]quida/i) || find(/receita\s+operacional\s+l[ií]quida/i);
    const receitaBruta = find(/receita\s+bruta/i) || find(/receita\s+operacional\s+bruta/i);
    const lucroLiquido = find(/lucro\s+l[ií]quido/i) || find(/resultado\s+l[ií]quido/i);
    const ativoTotal = balanco
      .filter((b) => /ativo\s+total/i.test(b.conta))
      .reduce((s, b) => s + (b.valor || 0), 0);
    const passivoTotal = balanco
      .filter((b) => /passivo\s+total/i.test(b.conta))
      .reduce((s, b) => s + (b.valor || 0), 0);
    return { receitaLiquida, receitaBruta, lucroLiquido, ativoTotal, passivoTotal };
  }, [dre, balanco]);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header mínimo */}
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
          <h1 className="font-display text-3xl font-bold mb-2">{empresa?.nome}</h1>
          <p className="text-muted-foreground">Visualização do Cliente — Somente Leitura</p>
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={<Receipt className="w-5 h-5" />} label="Receita Bruta" value={brl(kpis.receitaBruta)} />
          <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="Receita Líquida" value={brl(kpis.receitaLiquida)} />
          <KpiCard
            icon={kpis.lucroLiquido >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            label={kpis.lucroLiquido >= 0 ? "Lucro Líquido" : "Prejuízo"}
            value={brl(Math.abs(kpis.lucroLiquido))}
            accent={kpis.lucroLiquido >= 0 ? "text-emerald-600" : "text-destructive"}
          />
          <KpiCard icon={<Building className="w-5 h-5" />} label="Ativo Total" value={brl(kpis.ativoTotal)} />
        </section>

        {/* DRE */}
        {dre.length > 0 && (
          <section>
            <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2">
              <Wallet className="w-6 h-6 text-primary" />
              DRE — Demonstração do Resultado
            </h2>
            <DataTable
              headers={["Descrição", "Grupo", "Valor", "Anterior"]}
              rows={dre.map((d) => [
                d.descricao,
                d.grupo || "—",
                brl(d.valor),
                d.valor_anterior != null ? brl(d.valor_anterior) : "—",
              ])}
            />
          </section>
        )}

        {/* Balanço */}
        {balanco.length > 0 && (
          <section>
            <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2">
              <Building className="w-6 h-6 text-primary" />
              Balanço Patrimonial
            </h2>
            <DataTable
              headers={["Conta", "Tipo", "Valor", "Anterior"]}
              rows={balanco.map((b) => [
                b.conta,
                b.tipo,
                brl(b.valor),
                b.valor_anterior != null ? brl(b.valor_anterior) : "—",
              ])}
            />
          </section>
        )}

        {/* Balancete */}
        {balancete.length > 0 && (
          <section>
            <h2 className="font-display text-2xl font-bold mb-4">Balancete</h2>
            <DataTable
              headers={["Conta", "Grupo", "Saldo Anterior", "Débitos", "Créditos", "Saldo Atual"]}
              rows={balancete.map((b) => [
                b.conta,
                b.grupo,
                brl(b.saldo_anterior),
                brl(b.debitos),
                brl(b.creditos),
                brl(b.saldo_atual),
              ])}
            />
          </section>
        )}

        {/* Faturamento */}
        {faturamento.length > 0 && (
          <section>
            <h2 className="font-display text-2xl font-bold mb-4">Faturamento Mensal</h2>
            <FaturamentoAnalysis data={faturamento} />
          </section>
        )}

        <footer className="border-t pt-6 text-center text-xs text-muted-foreground">
          Visualização gerada por KlarCont — somente leitura
        </footer>
      </main>
    </div>
  );
}

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="glass-card p-5 rounded-xl border bg-card">
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
        {icon}<span>{label}</span>
      </div>
      <div className={`font-display text-2xl font-bold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t hover:bg-muted/30">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2 ${j >= 2 ? "text-right tabular-nums" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}