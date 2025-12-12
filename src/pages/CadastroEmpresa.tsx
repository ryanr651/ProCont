import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCNPJ, isValidCNPJ } from "@/lib/cnpjMask";
import { Building2, Save, X, Loader2 } from "lucide-react";

const regimesTributarios = [
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
  "MEI",
  "Outro",
];

const CadastroEmpresa = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    nome: "",
    cnpj: "",
    cnae: "",
    regime_tributario: "",
    contexto: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCNPJ(e.target.value);
    setFormData((prev) => ({ ...prev, cnpj: formatted }));
    if (errors.cnpj) setErrors((prev) => ({ ...prev, cnpj: "" }));
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.nome.trim()) {
      newErrors.nome = "Nome da empresa é obrigatório";
    }
    if (!formData.cnpj.trim()) {
      newErrors.cnpj = "CNPJ é obrigatório";
    } else if (!isValidCNPJ(formData.cnpj)) {
      newErrors.cnpj = "CNPJ deve ter 14 dígitos";
    }
    if (!formData.cnae.trim()) {
      newErrors.cnae = "CNAE é obrigatório";
    }
    if (!formData.regime_tributario) {
      newErrors.regime_tributario = "Regime tributário é obrigatório";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para cadastrar uma empresa.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("empresas").insert({
        nome: formData.nome.trim(),
        cnpj: formData.cnpj,
        cnae: formData.cnae.trim(),
        regime_tributario: formData.regime_tributario,
        contexto: formData.contexto.trim() || null,
        user_id: user.id,
      });

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Empresa cadastrada com sucesso.",
      });

      navigate("/empresas");
    } catch (error: any) {
      console.error("Erro ao cadastrar empresa:", error);
      toast({
        title: "Erro ao cadastrar",
        description: error.message || "Ocorreu um erro ao salvar a empresa.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="hero-glow w-full h-[600px] top-0 left-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />

      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-6 flex items-center justify-between">
        <Logo />
        <Button variant="ghost" size="sm" onClick={() => navigate("/empresas")}>
          <X className="w-4 h-4 mr-2" />
          Voltar
        </Button>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 container mx-auto px-6 py-8 max-w-2xl">
        <div className="glass-card p-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">Cadastrar Empresa</h1>
              <p className="text-muted-foreground text-sm">
                Cadastre os clientes do seu escritório contábil
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da Empresa *</Label>
              <Input
                id="nome"
                placeholder="Ex: Empresa XYZ Ltda"
                value={formData.nome}
                onChange={(e) => handleChange("nome", e.target.value)}
                className={errors.nome ? "border-destructive" : ""}
              />
              {errors.nome && (
                <p className="text-sm text-destructive">{errors.nome}</p>
              )}
            </div>

            {/* CNPJ */}
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ *</Label>
              <Input
                id="cnpj"
                placeholder="XX.XXX.XXX/XXXX-XX"
                value={formData.cnpj}
                onChange={handleCNPJChange}
                className={errors.cnpj ? "border-destructive" : ""}
              />
              {errors.cnpj && (
                <p className="text-sm text-destructive">{errors.cnpj}</p>
              )}
            </div>

            {/* CNAE */}
            <div className="space-y-2">
              <Label htmlFor="cnae">CNAE *</Label>
              <Input
                id="cnae"
                placeholder="Ex: 6201-5/00"
                value={formData.cnae}
                onChange={(e) => handleChange("cnae", e.target.value)}
                className={errors.cnae ? "border-destructive" : ""}
              />
              {errors.cnae && (
                <p className="text-sm text-destructive">{errors.cnae}</p>
              )}
            </div>

            {/* Regime Tributário */}
            <div className="space-y-2">
              <Label>Regime Tributário *</Label>
              <Select
                value={formData.regime_tributario}
                onValueChange={(value) => handleChange("regime_tributario", value)}
              >
                <SelectTrigger className={errors.regime_tributario ? "border-destructive" : ""}>
                  <SelectValue placeholder="Selecione o regime tributário" />
                </SelectTrigger>
                <SelectContent>
                  {regimesTributarios.map((regime) => (
                    <SelectItem key={regime} value={regime}>
                      {regime}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.regime_tributario && (
                <p className="text-sm text-destructive">{errors.regime_tributario}</p>
              )}
            </div>

            {/* Contexto */}
            <div className="space-y-2">
              <Label htmlFor="contexto">Contexto da Empresa</Label>
              <Textarea
                id="contexto"
                placeholder="Descreva o contexto da empresa (opcional). Este campo será utilizado futuramente para análises com IA."
                value={formData.contexto}
                onChange={(e) => handleChange("contexto", e.target.value)}
                rows={5}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Este campo será utilizado no futuro para a IA entender melhor o cenário da empresa.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                variant="neon"
                className="flex-1"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Empresa
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/empresas")}
                disabled={loading}
              >
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CadastroEmpresa;
