import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Zap, Star, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const PLANS = {
  monthly: {
    priceId: "price_1TE6kzFAXSHGgoPGDmLOKR2w",
    label: "Mensal",
    price: 99.90,
    perMonth: 99.90,
    interval: "mês",
    discount: null,
  },
  quarterly: {
    priceId: "price_1TEF3wFAXSHGgoPGO64QLMk7",
    label: "Trimestral",
    price: 284.70,
    perMonth: 94.90,
    interval: "trimestre",
    discount: "5%",
  },
  yearly: {
    priceId: "price_1TE6m8FAXSHGgoPGM7LHE708",
    label: "Anual",
    price: 1078.92,
    perMonth: 89.91,
    interval: "ano",
    discount: "10%",
  },
};

type PlanKey = keyof typeof PLANS;

const FEATURES = [
  "Upload ilimitado de DRE, Balanço e Balancete",
  "Classificação automática por IA",
  "Dashboard com indicadores financeiros",
  "Análise Inteligente com IA",
  "Simulador Financeiro IA",
  "Exportação em PPTX profissional",
  "Comparativo de períodos",
  "Gestão de múltiplas empresas",
  "Gerenciamento de usuários",
  "Suporte prioritário",
];

export default function Planos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("quarterly");
  const [loading, setLoading] = useState(false);
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
                    Plano {PLANS[activePlanKey].label} ativo
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

        {/* Billing toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-muted rounded-xl p-1 gap-1">
            {(Object.keys(PLANS) as PlanKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSelectedPlan(key)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  selectedPlan === key
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {PLANS[key].label}
                {PLANS[key].discount && (
                  <span className="ml-1.5 text-xs opacity-80">-{PLANS[key].discount}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Price card */}
        <div className="max-w-lg mx-auto">
          <Card className="relative overflow-hidden border-primary/30">
            {/* Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-secondary/20 rounded-full blur-3xl" />

            <CardHeader className="relative text-center pb-2">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-primary" />
                <CardTitle className="text-2xl font-display">KlarCont</CardTitle>
              </div>
              <div className="mt-4">
                <span className="text-5xl font-bold">
                  R$ {PLANS[selectedPlan].perMonth.toFixed(2).replace(".", ",")}
                </span>
                <span className="text-muted-foreground">/mês</span>
              </div>
              {selectedPlan !== "monthly" && (
                <p className="text-sm text-muted-foreground mt-2">
                  Cobrado R$ {PLANS[selectedPlan].price.toFixed(2).replace(".", ",")} por{" "}
                  {PLANS[selectedPlan].interval}
                </p>
              )}
              {PLANS[selectedPlan].discount && (
                <Badge className="mt-3 bg-primary/20 text-primary border-primary/30">
                  Economia de {PLANS[selectedPlan].discount}
                </Badge>
              )}
            </CardHeader>

            <CardContent className="relative pt-6">
              <ul className="space-y-3 mb-8">
                {FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {checkingSubscription ? (
                <Button className="w-full" disabled>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Verificando...
                </Button>
              ) : activePlanKey === selectedPlan ? (
                <Button className="w-full" variant="outline" onClick={handleManageSubscription} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Plano atual — Gerenciar
                </Button>
              ) : (
                <Button
                  className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground"
                  size="lg"
                  onClick={() => handleCheckout(selectedPlan)}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {isSubscribed ? "Alterar plano" : "Assinar agora"}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
