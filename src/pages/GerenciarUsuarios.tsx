import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";
import {
  Loader2,
  UserPlus,
  Users,
  UserX,
  UserCheck,
  Mail,
  Lock,
  User,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

interface Funcionario {
  user_id: string;
  display_name: string;
  email: string;
  status: string;
  created_at: string;
}

const GerenciarUsuarios = () => {
  const { user } = useAuth();
  const { isMaster } = useBranding();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!isMaster) {
      navigate("/upload");
      return;
    }
    fetchFuncionarios();
  }, [isMaster]);

  const fetchFuncionarios = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "manage-funcionario",
        {
          body: { action: "list" },
        }
      );
      if (error) throw error;
      setFuncionarios(data.funcionarios || []);
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newEmail || !newPassword) {
      toast({
        title: "Campos obrigatórios",
        description: "Email e senha são obrigatórios.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "manage-funcionario",
        {
          body: {
            action: "create",
            email: newEmail,
            password: newPassword,
            display_name: newName,
          },
        }
      );
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({ title: "Sucesso!", description: "Funcionário criado." });
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setDialogOpen(false);
      fetchFuncionarios();
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    try {
      const { data, error } = await supabase.functions.invoke(
        "manage-funcionario",
        {
          body: { action: "toggle_status", user_id: userId, status: newStatus },
        }
      );
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: "Atualizado",
        description: `Usuário ${newStatus === "active" ? "ativado" : "desativado"}.`,
      });
      fetchFuncionarios();
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (userId: string, name: string) => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "manage-funcionario",
        {
          body: { action: "delete", user_id: userId },
        }
      );
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: "Excluído",
        description: `Funcionário "${name}" foi removido permanentemente.`,
      });
      fetchFuncionarios();
    } catch (err: any) {
      toast({
        title: "Erro ao excluir",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto px-6 pt-24 pb-12 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            Gerenciar Usuários
          </h1>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="hero">
                <UserPlus className="w-4 h-4 mr-2" />
                Novo Funcionário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Funcionário</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nome do funcionário"
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Senha do funcionário"
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button
                  variant="hero"
                  className="w-full"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2" />
                  )}
                  Criar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : funcionarios.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Nenhum funcionário cadastrado.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {funcionarios.map((f) => (
              <div
                key={f.user_id}
                className="glass-card p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {f.display_name || f.email}
                    </p>
                    <p className="text-sm text-muted-foreground">{f.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={f.status === "active" ? "default" : "destructive"}
                  >
                    {f.status === "active" ? "Ativo" : "Inativo"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleStatus(f.user_id, f.status)}
                    title={f.status === "active" ? "Desativar" : "Ativar"}
                  >
                    {f.status === "active" ? (
                      <UserX className="w-4 h-4 text-destructive" />
                    ) : (
                      <UserCheck className="w-4 h-4 text-green-500" />
                    )}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Excluir permanentemente"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir funcionário?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação é irreversível. O usuário{" "}
                          <strong>{f.display_name || f.email}</strong> será
                          removido permanentemente do sistema, incluindo todos os
                          seus dados de acesso.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() =>
                            handleDelete(f.user_id, f.display_name || f.email)
                          }
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

export default GerenciarUsuarios;
