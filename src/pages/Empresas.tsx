import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Plus,
  Loader2,
  LogOut,
  Home,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
  cnae: string;
  regime_tributario: string;
  created_at: string;
}

const Empresas = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmpresas();
  }, [user]);

  const fetchEmpresas = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nome, cnpj, cnae, regime_tributario, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEmpresas(data || []);
    } catch (error: any) {
      console.error("Erro ao buscar empresas:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as empresas.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, nome: string) => {
    try {
      const { error } = await supabase.from("empresas").delete().eq("id", id);
      if (error) throw error;

      setEmpresas((prev) => prev.filter((e) => e.id !== id));
      toast({
        title: "Empresa excluída",
        description: `"${nome}" foi removida com sucesso.`,
      });
    } catch (error: any) {
      console.error("Erro ao excluir empresa:", error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir a empresa.",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
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
          <Link to="/">
            <Button variant="ghost" size="sm">
              <Home className="w-4 h-4 mr-2" />
              Início
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold">Empresas</h1>
              <p className="text-muted-foreground">
                Gerencie os clientes do seu escritório
              </p>
            </div>
          </div>
          <Link to="/cadastro-empresa">
            <Button variant="neon">
              <Plus className="w-4 h-4 mr-2" />
              Cadastrar Nova Empresa
            </Button>
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : empresas.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold mb-2">
              Nenhuma empresa cadastrada
            </h2>
            <p className="text-muted-foreground mb-6">
              Comece cadastrando a primeira empresa do seu escritório.
            </p>
            <Link to="/cadastro-empresa">
              <Button variant="neon">
                <Plus className="w-4 h-4 mr-2" />
                Cadastrar Empresa
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {empresas.map((empresa) => (
              <div
                key={empresa.id}
                className="glass-card p-6 flex items-center justify-between hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-lg">
                      {empresa.nome}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>CNPJ: {empresa.cnpj}</span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                      <span>{empresa.regime_tributario}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja excluir "{empresa.nome}"? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(empresa.id, empresa.nome)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Empresas;
