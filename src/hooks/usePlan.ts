import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { PLAN_CONFIG, type PlanType } from "@/config/plans";

export function usePlan() {
  const { user } = useAuth();
  const [plano, setPlano] = useState<PlanType>("sem_plano");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user) {
      setPlano("sem_plano");
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("profiles")
      .select("plano, master_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!active) return;
        // Funcionários herdam o plano do master
        if (data?.master_id) {
          const { data: master } = await supabase
            .from("profiles")
            .select("plano")
            .eq("user_id", data.master_id)
            .maybeSingle();
          if (!active) return;
          setPlano(((master?.plano as PlanType) ?? "sem_plano"));
        } else {
          setPlano(((data?.plano as PlanType) ?? "sem_plano"));
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const config = PLAN_CONFIG[plano];

  return {
    plano,
    loading,
    isPago: plano !== "sem_plano",
    maxEmpresas: config.max_empresas,
    temFaturamento: config.features.faturamento,
    temSimulador: config.features.simulador,
    temLinkCliente: config.features.link_cliente,
    temWhitelabel: config.features.whitelabel,
  };
}
