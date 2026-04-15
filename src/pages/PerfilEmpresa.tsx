import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";
import { Loader2, Save, Upload, Building2 } from "lucide-react";
import { formatCNPJ, formatPhone, isValidEmail } from "@/lib/cnpjMask";

const PerfilEmpresa = () => {
  const { user } = useAuth();
  const { branding, isMaster, refetchBranding } = useBranding();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [emailEmpresa, setEmailEmpresa] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cnpjEmpresa, setCnpjEmpresa] = useState("");
  const [telefoneFixo, setTelefoneFixo] = useState("");
  const [nomeResponsavel, setNomeResponsavel] = useState("");
  const [emailResponsavel, setEmailResponsavel] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isMaster) {
      navigate("/upload");
      return;
    }
    if (branding) {
      setNomeEmpresa(branding.nome_empresa || "");
      setEmailEmpresa(branding.email_empresa || "");
      setEndereco(branding.endereco || "");
      setCnpjEmpresa(branding.cnpj_empresa || "");
      setTelefoneFixo(branding.telefone_fixo || "");
      setNomeResponsavel(branding.nome_responsavel || "");
      setEmailResponsavel(branding.email_responsavel || "");
      setLogoUrl(branding.logo_url || "");
      setLogoPreview(branding.logo_url || null);
    }
  }, [branding, isMaster]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      let finalLogoUrl = logoUrl;

      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = `${user.id}/logo.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("logos")
          .upload(path, logoFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrl } = supabase.storage
          .from("logos")
          .getPublicUrl(path);
        finalLogoUrl = publicUrl.publicUrl;
      }

      const { error } = await supabase
        .from("master_branding")
        .update({
          nome_empresa: nomeEmpresa || null,
          email_empresa: emailEmpresa || null,
          endereco: endereco || null,
          cnpj_empresa: cnpjEmpresa || null,
          telefone_fixo: telefoneFixo || null,
          nome_responsavel: nomeResponsavel || null,
          email_responsavel: emailResponsavel || null,
          logo_url: finalLogoUrl || null,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      await refetchBranding();
      toast({ title: "Salvo!", description: "Dados da empresa atualizados." });
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto px-6 pt-24 pb-12 max-w-2xl">
        <h1 className="font-display text-3xl font-bold mb-8 flex items-center gap-3">
          <Building2 className="w-8 h-8 text-primary" />
          Perfil da Empresa
        </h1>

        <div className="glass-card p-8 space-y-6">
          {/* Logo */}
          <div className="space-y-2">
            <Label>Logo da Empresa</Label>
            <div className="flex items-center gap-4">
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt="Logo"
                  className="w-20 h-20 object-contain rounded-lg border border-border bg-background"
                />
              )}
              <label className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border hover:border-primary transition-colors">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">Enviar logo</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome da Empresa</Label>
            <Input
              id="nome"
              value={nomeEmpresa}
              onChange={(e) => setNomeEmpresa(e.target.value)}
              placeholder="Nome da empresa contratante"
            />
          </div>

          {/* Email da Empresa */}
          <div className="space-y-2">
            <Label htmlFor="emailEmpresa">Email da Empresa</Label>
            <Input
              id="emailEmpresa"
              type="email"
              value={emailEmpresa}
              onChange={(e) => setEmailEmpresa(e.target.value)}
              placeholder="contato@empresa.com.br"
            />
          </div>

          {/* Endereço */}
          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço</Label>
            <Input
              id="endereco"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, número, bairro, cidade - UF"
            />
          </div>

          {/* CNPJ */}
          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input
              id="cnpj"
              value={cnpjEmpresa}
              onChange={(e) => setCnpjEmpresa(formatCNPJ(e.target.value))}
              placeholder="00.000.000/0000-00"
            />
          </div>

          {/* Telefone */}
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone Fixo</Label>
            <Input
              id="telefone"
              value={telefoneFixo}
              onChange={(e) => setTelefoneFixo(e.target.value)}
              placeholder="(00) 0000-0000"
            />
          </div>

          {/* Nome do Responsável */}
          <div className="space-y-2">
            <Label htmlFor="nomeResponsavel">Nome do Responsável</Label>
            <Input
              id="nomeResponsavel"
              value={nomeResponsavel}
              onChange={(e) => setNomeResponsavel(e.target.value)}
              placeholder="Nome completo do responsável"
            />
          </div>

          {/* Email do Responsável */}
          <div className="space-y-2">
            <Label htmlFor="emailResponsavel">Email do Responsável</Label>
            <Input
              id="emailResponsavel"
              type="email"
              value={emailResponsavel}
              onChange={(e) => setEmailResponsavel(e.target.value)}
              placeholder="responsavel@empresa.com.br"
            />
          </div>

          <Button
            variant="hero"
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>
      </main>
    </div>
  );
};

export default PerfilEmpresa;
