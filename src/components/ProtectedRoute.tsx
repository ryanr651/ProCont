import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Loader2 } from "lucide-react";
import { usePlan } from "@/hooks/usePlan";
import { PlanBlocker } from "@/components/PlanBlocker";

interface ProtectedRouteProps {
  children: React.ReactNode;
  masterOnly?: boolean;
  allowWithoutPlan?: boolean;
}

export function ProtectedRoute({ children, masterOnly, allowWithoutPlan }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { userRole, loading: brandingLoading, isMaster } = useBranding();
  const { isPago, loading: planLoading } = usePlan();

  if (authLoading || brandingLoading || planLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user is active (cascade check)
  if (userRole && !userRole.isActive) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card p-8 text-center max-w-md">
          <h2 className="font-display text-2xl font-bold mb-4 text-destructive">
            Conta Desativada
          </h2>
          <p className="text-muted-foreground">
            Sua conta foi desativada pelo administrador. Entre em contato com o responsável.
          </p>
        </div>
      </div>
    );
  }

  if (masterOnly && !isMaster) {
    return <Navigate to="/upload" replace />;
  }

  if (!allowWithoutPlan && !isPago) {
    return <PlanBlocker />;
  }

  return <>{children}</>;
}
