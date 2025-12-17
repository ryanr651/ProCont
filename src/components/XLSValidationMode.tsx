import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";

export interface ValidationRow {
  rowIndex: number;
  textoConta: string;
  numerosDetectados: { value: number; raw: string }[];
  classificacao?: string;
  secaoAtual?: string;
  alerta?: string;
}

interface XLSValidationModeProps {
  rows: ValidationRow[];
  filename: string;
  onClose?: () => void;
}

export function XLSValidationMode({ rows, filename, onClose }: XLSValidationModeProps) {
  const [expanded, setExpanded] = useState(true);
  const [filterProblems, setFilterProblems] = useState(false);

  const problemRows = rows.filter(r => r.alerta);
  const rowsToShow = filterProblems ? problemRows : rows;

  const getSectionColor = (secao?: string) => {
    switch (secao) {
      case "ATIVO": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "PASSIVO": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "PL": return "bg-violet-500/20 text-violet-400 border-violet-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getClassificationColor = (classificacao?: string) => {
    if (!classificacao) return "";
    if (classificacao.includes("ATIVO")) return "text-emerald-400";
    if (classificacao.includes("PASSIVO")) return "text-amber-400";
    if (classificacao.includes("PATRIMONIO")) return "text-violet-400";
    return "text-muted-foreground";
  };

  return (
    <Card className="border-primary/30 bg-card/50 backdrop-blur">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Validação XLS - Linha a Linha</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterProblems(!filterProblems)}
              className={filterProblems ? "bg-destructive/20" : ""}
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              {filterProblems ? `Alertas (${problemRows.length})` : "Filtrar Alertas"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                ✕
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Arquivo: <span className="font-mono text-primary">{filename}</span> • 
          Total: {rows.length} linhas • 
          Alertas: {problemRows.length}
        </p>
      </CardHeader>

      {expanded && (
        <CardContent>
          <ScrollArea className="h-[400px] rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-24">Seção</TableHead>
                  <TableHead>Texto Detectado</TableHead>
                  <TableHead className="w-40">Números na Linha</TableHead>
                  <TableHead className="w-36">Classificação</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsToShow.map((row) => (
                  <TableRow 
                    key={row.rowIndex}
                    className={row.alerta ? "bg-destructive/10" : ""}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.rowIndex}
                    </TableCell>
                    <TableCell>
                      {row.secaoAtual && (
                        <Badge variant="outline" className={getSectionColor(row.secaoAtual)}>
                          {row.secaoAtual}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{row.textoConta || "(vazio)"}</span>
                    </TableCell>
                    <TableCell>
                      {row.numerosDetectados.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {row.numerosDetectados.map((n, i) => (
                            <span key={i} className="font-mono text-sm text-primary">
                              {n.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">sem valores</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.classificacao && (
                        <span className={`text-sm font-medium ${getClassificationColor(row.classificacao)}`}>
                          {row.classificacao}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.alerta ? (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          <span className="text-xs text-destructive">{row.alerta}</span>
                        </div>
                      ) : row.numerosDetectados.length > 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm">
            <p className="font-medium mb-2">Legenda:</p>
            <div className="flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-1">
                <Badge variant="outline" className={getSectionColor("ATIVO")}>ATIVO</Badge>
                <span>Seção Ativo</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className={getSectionColor("PASSIVO")}>PASSIVO</Badge>
                <span>Seção Passivo</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className={getSectionColor("PL")}>PL</Badge>
                <span>Patrimônio Líquido</span>
              </div>
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span>Linha com problema</span>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default XLSValidationMode;
