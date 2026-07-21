import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Crown, Star, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { PLAN_PRICE_IDS } from "@/config/plans";

const PLANS = {
  basico: {
    priceId: PLAN_PRICE_IDS.basico.priceId,
    nome: "Básico",
    preco: 250,
    maxEmpresas: 5,
    destaque: false,
    features: [
      "Até 5 empresas",
      "DRE, Balanço e Balancete",
      "Análises com IA",
      "Dashboard de indicadores",
      "Exportação PDF e PPTX",
    ],
    bloqueadas: [
      "Ferramenta de Faturamento",
      "Simulador de Situações",
      "Link para Cliente",
      "Whitelabel / Personalização",
    ],
  },
  intermediario: {
    priceId: PLAN_PRICE_IDS.intermediario.priceId,
    nome: "Intermediário",
    preco: 400,
    maxEmpresas: 10,
    destaque: true,
    features: [
      "Até 10 empresas",
      "Tudo do plano Básico",
      "Ferramenta de Faturamento",
      "Simulador de Situações",
    ],
    bloqueadas: ["Link para Cliente", "Whitelabel / Personalização"],
  },
  premium: {
    priceId: PLAN_PRICE_IDS.premium.priceId,
    nome: "Premium",
    preco: 550,
    maxEmpresas: 20,
    destaque: false,
    features: [
      "Até 20 empresas",
      "Tudo do plano Intermediário",
      "Link para Cliente",
      "Whitelabel / Personalização",
      "Suporte prioritário",
    ],
    bloqueadas: [] as string[],
  },
};

type PlanKey = keyof typeof PLANS;

export default function Planos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [loadingKey, setLoadingKey] = useState<PlanKey | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [subscription, setSubscription] = useState<{
    subscribed: boolean;
    price_id: string | null;
    subscription_end: string | null;
  } | null>(null);

  const checkSubscription = async () => {
    if (!user) {
      setCheckingSubscription(false);
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const { data, error } = await supabase.functions.invoke("check-subscription", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      setSubscription(data);
    } catch (e) {
      console.error("Error checking subscription:", e);
    } finally {
      setCheckingSubscription(false);
    }
  };

  useEffect(() => {
    checkSubscription();
  }, [user]);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Assinatura realizada com sucesso! 🎉");
      checkSubscription();
    } else if (searchParams.get("canceled") === "true") {
      toast.info("Checkout cancelado.");
    }
  }, [searchParams]);

  const handleCheckout = async (planKey: PlanKey) => {
    if (!user) {
      toast.info("Faça login para assinar um plano.");
      navigate("/auth");
      return;
    }
    setLoading(true);
    setLoadingKey(planKey);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.");

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { priceId: PLANS[planKey].priceId },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao iniciar checkout");
    } finally {
      setLoading(false);
      setLoadingKey(null);
    }
  };

  const handleManageSubscription = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada.");

      const { data, error } = await supabase.functions.invoke("customer-portal", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao abrir portal");
    } finally {
      setLoading(false);
    }
  };

  const activePriceId = subscription?.price_id;
  const isSubscribed = subscription?.subscribed;

  const getActivePlanKey = (): PlanKey | null => {
    if (!activePriceId) return null;
    return (Object.keys(PLANS) as PlanKey[]).find(
      (key) => PLANS[key].priceId === activePriceId
    ) || null;
  };

  const activePlanKey = getActivePlanKey();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto px-4 pt-24 pb-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4">
            <Crown className="w-6 h-6 text-primary" />
            <Badge variant="outline" className="text-primary border-primary">
              KlarCont
            </Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">
            Escolha seu{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Plano
            </span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Tenha acesso completo a todas as funcionalidades de análise financeira com IA.
          </p>
        </div>

        {/* Subscription status */}
        {isSubscribed && activePlanKey && (
          <div className="max-w-xl mx-auto mb-10">
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="font-semibold text-lg flex items-center gap-2">
                    <Star className="w-5 h-5 text-primary" />
                    Plano {PLANS[activePlanKey].nome} ativo
                  </p>
                  {subscription?.subscription_end && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Próxima cobrança:{" "}
                      {new Date(subscription.subscription_end).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
                <Button variant="outline" onClick={handleManageSubscription} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  Gerenciar
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {(Object.keys(PLANS) as PlanKey[]).map((key) => {
            const plan = PLANS[key];
            const isActive = activePlanKey === key;
            return (
              <Card
                key={key}
                className={`relative overflow-hidden flex flex-col ${
                  plan.destaque
                    ? "border-primary/60 shadow-xl scale-[1.02]"
                    : "border-border"
                } ${isActive ? "ring-2 ring-primary" : ""}`}
              >
                {plan.destaque && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-bl-lg">
                    Mais popular
                  </div>
                )}
                <CardHeader className="pb-4">
                  <CardTitle className="text-2xl font-display">{plan.nome}</CardTitle>
                  <div className="mt-3">
                    <span className="text-4xl font-bold">
                      R$ {plan.preco.toFixed(2).replace(".", ",")}
                    </span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Até {plan.maxEmpresas} empresas
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col flex-1">
                  <ul className="space-y-2.5 mb-4">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.bloqueadas.length > 0 && (
                    <ul className="space-y-2.5 mb-6">
                      {plan.bloqueadas.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2 text-sm text-muted-foreground/70"
                        >
                          <X className="w-4 h-4 shrink-0 mt-0.5" />
                          <span className="line-through">{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-auto pt-2">
                    {checkingSubscription ? (
                      <Button className="w-full" disabled>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Verificando...
                      </Button>
                    ) : isActive ? (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={handleManageSubscription}
                        disabled={loading}
                      >
                        {loading && loadingKey === null ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        Plano atual — Gerenciar
                      </Button>
                    ) : (
                      <Button
                        className={`w-full ${
                          plan.destaque
                            ? "bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground"
                            : ""
                        }`}
                        variant={plan.destaque ? "default" : "outline"}
                        size="lg"
                        onClick={() => handleCheckout(key)}
                        disabled={loading}
                      >
                        {loadingKey === key ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        {isSubscribed ? "Alterar plano" : "Assinar agora"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
