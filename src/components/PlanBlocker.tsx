import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";

export function PlanBlocker() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto px-4 pt-32 pb-16 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-card border border-border rounded-2xl p-10 shadow-lg">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold mb-3">Acesso Restrito</h1>
          <p className="text-muted-foreground mb-8">
            Você precisa de um plano ativo para utilizar o KlarCont. Escolha o
            plano ideal para o seu escritório.
          </p>
          <Button size="lg" className="w-full" onClick={() => navigate("/planos")}>
            Ver Planos e Assinar
          </Button>
        </div>
      </div>
    </div>
  );
}
