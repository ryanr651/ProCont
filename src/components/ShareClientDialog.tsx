import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Trash2, Loader2, UserPlus, Link as LinkIcon } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: string;
  empresaNome?: string;
}

interface LinkRow {
  id: string;
  is_active: boolean;
}
interface LinkUser {
  id: string;
  username: string;
  created_at: string;
}

export function ShareClientDialog({ open, onOpenChange, empresaId, empresaNome }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<LinkRow | null>(null);
  const [users, setUsers] = useState<LinkUser[]>([]);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [adding, setAdding] = useState(false);

  const shareUrl = `${window.location.origin}/visualizar/${empresaId}`;

  const load = async () => {
    setLoading(true);
    const { data: existing } = await supabase
      .from("client_links")
      .select("id, is_active")
      .eq("empresa_id", empresaId)
      .maybeSingle();
    let l = existing;
    if (!l) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: created } = await supabase
          .from("client_links")
          .insert({ empresa_id: empresaId, created_by: user.id })
          .select("id, is_active")
          .single();
        l = created;
      }
    }
    setLink(l ?? null);
    if (l) {
      const { data: us } = await supabase
        .from("client_link_users")
        .select("id, username, created_at")
        .eq("link_id", l.id)
        .order("created_at", { ascending: true });
      setUsers(us ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && empresaId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empresaId]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copiado!", description: "Envie ao seu cliente." });
  };

  const toggleActive = async (val: boolean) => {
    if (!link) return;
    const { error } = await supabase
      .from("client_links")
      .update({ is_active: val })
      .eq("id", link.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setLink({ ...link, is_active: val });
    toast({ title: val ? "Link ativado" : "Link desativado" });
  };

  const addUser = async () => {
    if (!link) return;
    const username = newUser.trim();
    if (!username || newPass.length < 4) {
      toast({ title: "Dados inválidos", description: "Usuário e senha (mín. 4 caracteres) obrigatórios.", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const { data: hashRes, error: hashErr } = await supabase.functions.invoke("client-portal", {
        body: { action: "hash_password", password: newPass },
      });
      if (hashErr || !hashRes?.hash) throw new Error(hashErr?.message || "Falha ao gerar hash");
      const { error } = await supabase
        .from("client_link_users")
        .insert({ link_id: link.id, username, password_hash: hashRes.hash });
      if (error) throw error;
      setNewUser("");
      setNewPass("");
      await load();
      toast({ title: "Acesso adicionado" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const removeUser = async (id: string) => {
    if (!confirm("Remover este acesso?")) return;
    const { error } = await supabase.from("client_link_users").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    toast({ title: "Acesso removido" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-primary" />
            Compartilhar com Cliente
          </DialogTitle>
          <DialogDescription>
            {empresaNome ? `Empresa: ${empresaNome}` : "Gerencie o acesso do cliente às análises desta empresa."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-6">
            {/* Link fixo */}
            <div className="space-y-2">
              <Label>Link de acesso</Label>
              <div className="flex gap-2">
                <Input readOnly value={shareUrl} className="font-mono text-sm" />
                <Button onClick={copyLink} variant="outline"><Copy className="w-4 h-4 mr-2" />Copiar</Button>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-muted-foreground">Link ativo</span>
                <Switch checked={!!link?.is_active} onCheckedChange={toggleActive} />
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <Label className="text-base font-semibold">Gerenciar Acesso</Label>

              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <span className="font-medium">{u.username}</span>
                      <Button size="sm" variant="ghost" onClick={() => removeUser(u.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 pt-2">
                <Input placeholder="Usuário" value={newUser} onChange={(e) => setNewUser(e.target.value)} />
                <Input placeholder="Senha" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                <Button onClick={addUser} disabled={adding}>
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                  Adicionar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}