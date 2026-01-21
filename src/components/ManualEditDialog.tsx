import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Save, X, Edit3 } from "lucide-react";

// Types for editable entries
export interface EditableBalancoEntry {
  id: string;
  conta: string;
  tipo: string;
  valor: number;
  originalTipo: string;
  originalValor: number;
  isModified: boolean;
}

export interface EditableDREEntry {
  id: string;
  descricao: string;
  grupo: string;
  valor: number;
  originalGrupo: string;
  originalValor: number;
  isModified: boolean;
}

// BP Types (Balanço Patrimonial)
const BP_TYPES = [
  "ATIVO_CIRCULANTE",
  "ATIVO_NAO_CIRCULANTE",
  "PASSIVO_CIRCULANTE",
  "PASSIVO_NAO_CIRCULANTE",
  "PATRIMONIO_LIQUIDO",
  "ATIVO",
  "PASSIVO",
] as const;

// DRE Groups
const DRE_GROUPS = [
  "receita_bruta",
  "receita_liquida",
  "cmv",
  "lucro_bruto",
  "despesas_operacionais",
  "lucro_operacional",
  "resultado_financeiro",
  "lucro_liquido",
  "nao_classificado",
] as const;

// Labels for display
const BP_TYPE_LABELS: Record<string, string> = {
  ATIVO_CIRCULANTE: "Ativo Circulante",
  ATIVO_NAO_CIRCULANTE: "Ativo Não Circulante",
  PASSIVO_CIRCULANTE: "Passivo Circulante",
  PASSIVO_NAO_CIRCULANTE: "Passivo Não Circulante",
  PATRIMONIO_LIQUIDO: "Patrimônio Líquido",
  ATIVO: "Ativo Total",
  PASSIVO: "Passivo Total",
};

const DRE_GROUP_LABELS: Record<string, string> = {
  receita_bruta: "Receita Bruta",
  receita_liquida: "Receita Líquida",
  cmv: "CMV",
  lucro_bruto: "Lucro Bruto",
  despesas_operacionais: "Despesas Operacionais",
  lucro_operacional: "Lucro Operacional",
  resultado_financeiro: "Resultado Financeiro",
  lucro_liquido: "Lucro Líquido",
  nao_classificado: "Não Classificado",
};

interface ManualEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balancoEntries: EditableBalancoEntry[];
  dreEntries: EditableDREEntry[];
  onApplyChanges: (
    balancoEntries: EditableBalancoEntry[],
    dreEntries: EditableDREEntry[]
  ) => void;
  isApplying: boolean;
}

export function ManualEditDialog({
  open,
  onOpenChange,
  balancoEntries: initialBalanco,
  dreEntries: initialDRE,
  onApplyChanges,
  isApplying,
}: ManualEditDialogProps) {
  const [balancoEntries, setBalancoEntries] = useState<EditableBalancoEntry[]>([]);
  const [dreEntries, setDreEntries] = useState<EditableDREEntry[]>([]);
  const [activeTab, setActiveTab] = useState("balanco");

  // Initialize entries when dialog opens
  useEffect(() => {
    if (open) {
      setBalancoEntries(initialBalanco.map(e => ({ ...e })));
      setDreEntries(initialDRE.map(e => ({ ...e })));
    }
  }, [open, initialBalanco, initialDRE]);

  // Update BP entry
  const updateBalancoEntry = (
    id: string,
    field: "tipo" | "valor",
    value: string | number
  ) => {
    setBalancoEntries(prev =>
      prev.map(entry => {
        if (entry.id !== id) return entry;
        
        const updated = { ...entry };
        if (field === "tipo") {
          updated.tipo = value as string;
        } else {
          updated.valor = typeof value === "string" ? parseFloat(value) || 0 : value;
        }
        
        // Check if modified from original
        updated.isModified =
          updated.tipo !== updated.originalTipo ||
          updated.valor !== updated.originalValor;
        
        return updated;
      })
    );
  };

  // Update DRE entry
  const updateDREEntry = (
    id: string,
    field: "grupo" | "valor",
    value: string | number
  ) => {
    setDreEntries(prev =>
      prev.map(entry => {
        if (entry.id !== id) return entry;
        
        const updated = { ...entry };
        if (field === "grupo") {
          updated.grupo = value as string;
        } else {
          updated.valor = typeof value === "string" ? parseFloat(value) || 0 : value;
        }
        
        // Check if modified from original
        updated.isModified =
          updated.grupo !== updated.originalGrupo ||
          updated.valor !== updated.originalValor;
        
        return updated;
      })
    );
  };

  // Count modifications
  const modifiedBalancoCount = balancoEntries.filter(e => e.isModified).length;
  const modifiedDRECount = dreEntries.filter(e => e.isModified).length;
  const totalModified = modifiedBalancoCount + modifiedDRECount;

  // Handle apply
  const handleApply = () => {
    onApplyChanges(balancoEntries, dreEntries);
  };

  // Format value for input
  const formatValueForInput = (value: number): string => {
    return value.toString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Edit3 className="w-5 h-5 text-primary" />
            Modificações Manuais
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Altere o tipo e/ou valor de cada conta conforme necessário. Todas as alterações serão
            aplicadas e os resultados recalculados.
          </p>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="balanco" className="relative">
              Balanço Patrimonial
              {modifiedBalancoCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                  {modifiedBalancoCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="dre" className="relative">
              DRE
              {modifiedDRECount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                  {modifiedDRECount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="balanco" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-[400px] rounded-md border">
              <div className="p-4">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium w-[40%]">
                        Conta
                      </th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium w-[30%]">
                        Tipo
                      </th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium w-[25%]">
                        Valor
                      </th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium w-[5%]">
                        
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {balancoEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`border-b border-border/50 hover:bg-muted/30 ${
                          entry.isModified ? "bg-primary/5" : ""
                        }`}
                      >
                        <td className="py-2 px-3">
                          <span className="text-foreground truncate block max-w-[200px]" title={entry.conta}>
                            {entry.conta}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <Select
                            value={entry.tipo}
                            onValueChange={(value) => updateBalancoEntry(entry.id, "tipo", value)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BP_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {BP_TYPE_LABELS[type] || type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            type="number"
                            step="0.01"
                            value={formatValueForInput(entry.valor)}
                            onChange={(e) => updateBalancoEntry(entry.id, "valor", e.target.value)}
                            className="h-8 text-right text-xs"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          {entry.isModified && (
                            <span className="inline-block w-2 h-2 rounded-full bg-primary" title="Modificado" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {balancoEntries.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma conta de Balanço encontrada.
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="dre" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-[400px] rounded-md border">
              <div className="p-4">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium w-[40%]">
                        Descrição
                      </th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium w-[30%]">
                        Grupo
                      </th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium w-[25%]">
                        Valor
                      </th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium w-[5%]">
                        
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dreEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`border-b border-border/50 hover:bg-muted/30 ${
                          entry.isModified ? "bg-primary/5" : ""
                        }`}
                      >
                        <td className="py-2 px-3">
                          <span className="text-foreground truncate block max-w-[200px]" title={entry.descricao}>
                            {entry.descricao}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <Select
                            value={entry.grupo}
                            onValueChange={(value) => updateDREEntry(entry.id, "grupo", value)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DRE_GROUPS.map((group) => (
                                <SelectItem key={group} value={group}>
                                  {DRE_GROUP_LABELS[group] || group}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            type="number"
                            step="0.01"
                            value={formatValueForInput(entry.valor)}
                            onChange={(e) => updateDREEntry(entry.id, "valor", e.target.value)}
                            className="h-8 text-right text-xs"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          {entry.isModified && (
                            <span className="inline-block w-2 h-2 rounded-full bg-primary" title="Modificado" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dreEntries.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma conta de DRE encontrada.
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between gap-4 pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {totalModified > 0 ? (
              <span className="text-primary font-medium">
                {totalModified} {totalModified === 1 ? "modificação" : "modificações"} pendentes
              </span>
            ) : (
              <span>Nenhuma modificação</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplying}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              variant="hero"
              onClick={handleApply}
              disabled={isApplying || totalModified === 0}
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Aplicando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Aplicar Modificações
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
