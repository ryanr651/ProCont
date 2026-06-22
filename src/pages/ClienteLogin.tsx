import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const TOKEN_KEY = (id: string) => `klarcont_client_token_${id}`;

export default function ClienteLogin() {
  const { empresaId } = useParams<{ empresaId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [empresaNome, setEmpresaNome] = useState<string>("");
  const [active, setActive] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    const existing = sessionStorage.getItem(TOKEN_KEY(empresaId));
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        if (parsed.expires_at && parsed.expires_at * 1000 > Date.now()) {
          navigate(`/visualizar/${empresaId}/analise`, { replace: true });
          return;
        }
      } catch {}
    }
    (async () => {
      const { data } = await supabase.functions.invoke("client-portal", {
        body: { action: "info", empresa_id: empresaId },
      });
      if (data?.empresa) setEmpresaNome(data.empresa.nome);
      if (data) setActive(!!data.active);
      setLoading(false);
    })();
  }, [empresaId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaId) return;
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: invErr } = await supabase.functions.invoke("client-portal", {
        body: { action: "login", empresa_id: empresaId, username, password },
      });
      if (invErr) throw new Error(invErr.message);
      if (!data?.success) {
        setError(data?.error || "Credenciais inválidas");
        return;
      }
      sessionStorage.setItem(
        TOKEN_KEY(empresaId),
        JSON.stringify({ token: data.token, expires_at: data.expires_at }),
      );
      navigate(`/visualizar/${empresaId}/analise`, { replace: true });
    } catch (err: any) {
      setError(err.message || "Erro ao autenticar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo size="lg" />
        </div>
        <div className="glass-card p-8 rounded-2xl border bg-card shadow-lg">
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : !active ? (
            <div className="text-center space-y-2">
              <h1 className="font-display text-xl font-bold">Acesso indisponível</h1>
              <p className="text-sm text-muted-foreground">
                O link de visualização desta empresa está inativo. Entre em contato com o seu contador.
              </p>
            </div>
          ) : (
            <>
              <h1 className="font-display text-xl font-bold text-center mb-1">
                Acesso às Análises
              </h1>
              {empresaNome && (
                <p className="text-center text-muted-foreground mb-6">{empresaNome}</p>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Usuário</Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Entrar
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}