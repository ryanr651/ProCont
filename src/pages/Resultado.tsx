import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { MetricCard } from "@/components/MetricCard";
import { ProgressBar } from "@/components/ProgressBar";
import { XLSValidationMode, ValidationRow } from "@/components/XLSValidationMode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import html2pdf from "html2pdf.js";
import {
  ArrowLeft,
  TrendingUp,
  Wallet,
  PiggyBank,
  Building,
  Scale,
  Landmark,
  RefreshCw,
  DollarSign,
  Receipt,
  Calculator,
  LogOut,
  Loader2,
  FileSearch,
  FileDown
} from "lucide-react";

interface DREEntry {
  descricao: string;
  valor: number;
  valor_anterior: number | null;
}

interface BalancoEntry {
  conta: string;
  tipo: string;
  valor: number;
  valor_anterior: number | null;
  hierarchy: string;
}

interface DiagnosticLine {
  conta: string;
  valor: number;
  valorAnterior: number | null;
  colunaUsada: 'atual' | 'anterior' | 'nenhuma';
  encontrado: boolean;
  secao: 'ATIVO' | 'PASSIVO' | 'PL' | '-';
  tipoClassificado: string;
  motivo: string;
}

interface CalculatedDRE {
  receitaBruta: number;
  receitaLiquida: number;
  cmv: number;
  lucroBruto: number;
  despesasOperacionais: number;
  lucroOperacional: number;
  resultadoFinanceiro: number;
  lucroLiquido: number;
  margemBruta: number;
  margemOperacional: number;
  margemLiquida: number;
}

interface CalculatedBalanco {
  ativoCirculante: number;
  ativoNaoCirculante: number;
  ativoTotal: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
  passivoTotal: number;
  patrimonioLiquido: number;
}

/**
 * Normalize text for comparison (remove accents, uppercase)
 */
function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const Resultado = () => {
  const [loading, setLoading] = useState(true);
  const [dreData, setDreData] = useState<CalculatedDRE | null>(null);
  const [balancoData, setBalancoData] = useState<CalculatedBalanco | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [diagnosticLines, setDiagnosticLines] = useState<DiagnosticLine[]>([]);
  const [validationRows, setValidationRows] = useState<ValidationRow[]>([]);
  const [validationFilename, setValidationFilename] = useState<string>("balanco.xls");
  const [showValidation, setShowValidation] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const pdfContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    if (!user) return;

    try {
      // Load DRE entries
      const { data: dreEntries, error: dreError } = await supabase
        .from('dre_entries')
        .select('*')
        .eq('user_id', user.id);

      if (dreError) throw dreError;

      // Load Balanço entries
      const { data: balancoEntries, error: balancoError } = await supabase
        .from('balanco_entries')
        .select('*')
        .eq('user_id', user.id);

      if (balancoError) throw balancoError;

      if (!dreEntries?.length && !balancoEntries?.length) {
        navigate("/upload");
        return;
      }

      // Calculate DRE metrics
      const dre = calculateDREMetrics(dreEntries as DREEntry[]);
      setDreData(dre);

      // Calculate Balanço metrics from key lines
      const balanco = calculateBalancoMetrics(balancoEntries as BalancoEntry[]);
      setBalancoData(balanco);

      // Generate diagnostic lines for debugging
      const diagnostic = generateDiagnosticLines(balancoEntries as BalancoEntry[]);
      setDiagnosticLines(diagnostic);

      // Load validation logs from database
      const { data: validationLogs } = await supabase
        .from("xls_validation_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("tipo", "balanco")
        .order("created_at", { ascending: false })
        .limit(1);

      if (validationLogs && validationLogs.length > 0) {
        const log = validationLogs[0];
        // Cast from Json to ValidationRow[]
        const rows = (log.validation_rows as unknown) as ValidationRow[];
        setValidationRows(Array.isArray(rows) ? rows : []);
        setValidationFilename(log.filename || "balanco.xls");
      }

      // Generate insights
      setInsights(generateInsights(dre, balanco));
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateDREMetrics = (entries: DREEntry[]): CalculatedDRE => {
    const findValue = (keywords: string[]): number => {
      for (const entry of entries) {
        const desc = normalizeText(entry.descricao);
        for (const kw of keywords) {
          if (desc.includes(normalizeText(kw))) {
            return Math.abs(entry.valor);
          }
        }
      }
      return 0;
    };

    const receitaBruta = findValue(['receita operacional', 'receita bruta', 'vendas de mercadorias', 'prestação de serviços']);
    const receitaLiquida = findValue(['receita líquida', 'receita liquida']) || receitaBruta;
    const cmv = findValue(['custo mercadorias', 'custo dos produtos', 'cmv', 'cpv', 'custo das mercadorias']);
    const lucroBruto = findValue(['lucro bruto', 'resultado bruto']) || (receitaLiquida - cmv);
    const despesasOperacionais = findValue(['despesas operacionais', 'despesas trabalhistas', 'despesas gerais']);
    const lucroOperacional = findValue(['lucro operacional', 'resultado operacional']) || (lucroBruto - despesasOperacionais);
    const resultadoFinanceiro = findValue(['resultado financeiro', 'receitas financeiras']);
    const lucroLiquido = findValue(['lucro do exercício', 'lucro líquido', 'resultado do exercício', 'lucro do período']);

    const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;
    const margemOperacional = receitaLiquida > 0 ? (lucroOperacional / receitaLiquida) * 100 : 0;
    const margemLiquida = receitaLiquida > 0 ? (Math.abs(lucroLiquido) / receitaLiquida) * 100 : 0;

    return {
      receitaBruta,
      receitaLiquida,
      cmv,
      lucroBruto,
      despesasOperacionais,
      lucroOperacional,
      resultadoFinanceiro,
      lucroLiquido: Math.abs(lucroLiquido),
      margemBruta,
      margemOperacional,
      margemLiquida
    };
  };

  /**
   * Calculate Balanço metrics by finding KEY LINES directly
   * 
   * RULES (DO NOT SUM - read directly from specific lines):
   * 1. ATIVO → Ativo Total
   * 2. CIRCULANTE (first one after ATIVO) → Ativo Circulante
   * 3. ATIVO NAO CIRCULANTE or NAO CIRCULANTE (in ATIVO section) → Ativo Não Circulante
   * 4. PASSIVO → Passivo Total
   * 5. CIRCULANTE (first one after PASSIVO) → Passivo Circulante
   * 6. PASSIVO NAO CIRCULANTE or NAO CIRCULANTE (in PASSIVO section) → Passivo Não Circulante
   * 7. PATRIMONIO LIQUIDO → Patrimônio Líquido
   */
  const calculateBalancoMetrics = (entries: BalancoEntry[]): CalculatedBalanco => {
    let ativoTotal = 0;
    let ativoCirculante = 0;
    let ativoNaoCirculante = 0;
    let passivoTotal = 0;
    let passivoCirculante = 0;
    let passivoNaoCirculante = 0;
    let patrimonioLiquido = 0;

    // Track section context
    let inAtivoSection = false;
    let inPassivoSection = false;
    let foundAtivoCirculante = false;
    let foundPassivoCirculante = false;

    for (const entry of entries) {
      const valor = Math.abs(entry.valor);
      const conta = normalizeText(entry.conta);

      // 1. Line "ATIVO" → ATIVO_TOTAL
      if (conta === 'ATIVO') {
        ativoTotal = valor;
        inAtivoSection = true;
        inPassivoSection = false;
        continue;
      }

      // 4. Line "PASSIVO" → PASSIVO_TOTAL
      if (conta === 'PASSIVO') {
        passivoTotal = valor;
        inAtivoSection = false;
        inPassivoSection = true;
        continue;
      }

      // 2. Line "CIRCULANTE" under ATIVO → ATIVO_CIRCULANTE
      // 5. Line "CIRCULANTE" under PASSIVO → PASSIVO_CIRCULANTE
      if (conta === 'CIRCULANTE') {
        if (inAtivoSection && !foundAtivoCirculante) {
          ativoCirculante = valor;
          foundAtivoCirculante = true;
        } else if (inPassivoSection && !foundPassivoCirculante) {
          passivoCirculante = valor;
          foundPassivoCirculante = true;
        }
        continue;
      }

      // 3. Line "ATIVO NAO CIRCULANTE" or "NAO CIRCULANTE" under ATIVO
      if (conta === 'ATIVO NAO CIRCULANTE' || (conta === 'NAO CIRCULANTE' && inAtivoSection)) {
        ativoNaoCirculante = valor;
        continue;
      }

      // 6. Line "PASSIVO NAO CIRCULANTE" or "NAO CIRCULANTE" under PASSIVO
      if (conta === 'PASSIVO NAO CIRCULANTE' || (conta === 'NAO CIRCULANTE' && inPassivoSection)) {
        passivoNaoCirculante = valor;
        continue;
      }

      // 7. Line "PATRIMONIO LIQUIDO"
      if (conta === 'PATRIMONIO LIQUIDO') {
        patrimonioLiquido = valor;
        continue;
      }
    }

    return {
      ativoCirculante,
      ativoNaoCirculante,
      ativoTotal,
      passivoCirculante,
      passivoNaoCirculante,
      passivoTotal,
      patrimonioLiquido
    };
  };

  /**
   * Generate diagnostic lines for debugging import issues
   */
  const generateDiagnosticLines = (entries: BalancoEntry[]): DiagnosticLine[] => {
    const keyAccounts = ['ATIVO', 'CIRCULANTE', 'NAO CIRCULANTE', 'ATIVO NAO CIRCULANTE', 'PASSIVO', 'PASSIVO NAO CIRCULANTE', 'PATRIMONIO LIQUIDO'];
    const diagnostics: DiagnosticLine[] = [];

    // Track section context
    let currentSection: 'ATIVO' | 'PASSIVO' | 'PL' = 'ATIVO';
    let foundAtivoCirculante = false;
    let foundPassivoCirculante = false;

    for (const entry of entries) {
      const contaNorm = normalizeText(entry.conta);
      
      let secao: 'ATIVO' | 'PASSIVO' | 'PL' | '-' = currentSection;
      let motivo = '';
      let tipoClassificado = entry.tipo;

      if (contaNorm === 'ATIVO') {
        currentSection = 'ATIVO';
        secao = 'ATIVO';
        foundAtivoCirculante = false;
        motivo = 'Início da seção ATIVO';
      } else if (contaNorm === 'PASSIVO') {
        currentSection = 'PASSIVO';
        secao = 'PASSIVO';
        foundPassivoCirculante = false;
        motivo = 'Início da seção PASSIVO';
      } else if (contaNorm.includes('PATRIMONIO LIQUIDO')) {
        currentSection = 'PL';
        secao = 'PL';
        motivo = 'Patrimônio Líquido detectado';
      } else if (contaNorm === 'CIRCULANTE' || contaNorm.startsWith('CIRCULANTE')) {
        secao = currentSection;
        if (currentSection === 'ATIVO' && !foundAtivoCirculante) {
          foundAtivoCirculante = true;
          motivo = `PRIMEIRO "CIRCULANTE" na seção ATIVO → ATIVO_CIRCULANTE`;
        } else if (currentSection === 'PASSIVO' && !foundPassivoCirculante) {
          foundPassivoCirculante = true;
          motivo = `PRIMEIRO "CIRCULANTE" na seção PASSIVO → PASSIVO_CIRCULANTE`;
        } else {
          motivo = `"CIRCULANTE" adicional - subconta de ${tipoClassificado}`;
        }
      } else if (contaNorm === 'ATIVO CIRCULANTE') {
        secao = 'ATIVO';
        foundAtivoCirculante = true;
        motivo = '"ATIVO CIRCULANTE" explícito';
      } else if (contaNorm === 'PASSIVO CIRCULANTE') {
        secao = 'PASSIVO';
        foundPassivoCirculante = true;
        motivo = '"PASSIVO CIRCULANTE" explícito';
      } else if (contaNorm.includes('NAO CIRCULANTE')) {
        secao = currentSection;
        motivo = currentSection === 'ATIVO' 
          ? '"NÃO CIRCULANTE" na seção ATIVO → ATIVO_NAO_CIRCULANTE'
          : '"NÃO CIRCULANTE" na seção PASSIVO → PASSIVO_NAO_CIRCULANTE';
      } else {
        secao = currentSection;
        motivo = `Herda tipo da seção atual (${currentSection})`;
      }

      const isKeyAccount = keyAccounts.some(k => contaNorm === k || contaNorm.includes(k));
      
      if (isKeyAccount) {
        const hasValor = entry.valor !== 0;
        const hasValorAnterior = entry.valor_anterior !== null && entry.valor_anterior !== 0;
        
        diagnostics.push({
          conta: entry.conta,
          valor: entry.valor,
          valorAnterior: entry.valor_anterior,
          colunaUsada: hasValor ? 'atual' : (hasValorAnterior ? 'anterior' : 'nenhuma'),
          encontrado: hasValor || hasValorAnterior,
          secao,
          tipoClassificado,
          motivo
        });
      }
    }

    return diagnostics;
  };

  const generateInsights = (dre: CalculatedDRE, balanco: CalculatedBalanco): string[] => {
    const insights: string[] = [];

    if (dre.margemLiquida > 20) {
      insights.push("✅ Margem líquida excelente, acima de 20%. A empresa demonstra alta eficiência na conversão de receitas em lucro.");
    } else if (dre.margemLiquida > 10) {
      insights.push("👍 Margem líquida saudável entre 10-20%. Há espaço para otimização de custos.");
    } else if (dre.margemLiquida > 0) {
      insights.push("⚠️ Margem líquida abaixo de 10%. Recomenda-se revisão de custos operacionais e estratégia de preços.");
    } else {
      insights.push("🚨 Empresa operando com prejuízo. Necessária reestruturação urgente de custos.");
    }

    if (dre.receitaLiquida > 10000000) {
      insights.push("📈 Receita líquida acima de R$ 10 milhões indica operação de grande porte.");
    } else if (dre.receitaLiquida > 1000000) {
      insights.push("📊 Receita líquida na faixa de R$ 1-10 milhões, característica de empresa de médio porte.");
    }

    if (balanco.ativoTotal > 0 && balanco.passivoCirculante > 0) {
      const liquidezGeral = balanco.ativoCirculante / balanco.passivoCirculante;
      if (liquidezGeral > 2) {
        insights.push("💰 Liquidez corrente excelente. A empresa tem folga financeira para honrar compromissos de curto prazo.");
      } else if (liquidezGeral > 1) {
        insights.push("💵 Liquidez corrente adequada. Ativo circulante cobre as obrigações de curto prazo.");
      } else {
        insights.push("⚠️ Liquidez corrente preocupante. Pode haver dificuldades no pagamento de obrigações de curto prazo.");
      }
    }

    if (balanco.patrimonioLiquido > 0 && balanco.ativoTotal > 0) {
      const proporcaoPL = (balanco.patrimonioLiquido / balanco.ativoTotal) * 100;
      if (proporcaoPL > 50) {
        insights.push("🏦 Estrutura de capital sólida com baixa dependência de terceiros.");
      } else if (proporcaoPL > 30) {
        insights.push("📋 Estrutura de capital equilibrada entre capital próprio e de terceiros.");
      } else {
        insights.push("⚡ Alta alavancagem financeira. Empresa depende significativamente de capital de terceiros.");
      }
    }

    return insights;
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const handleExportPDF = async () => {
    if (!pdfContentRef.current) return;
    
    setIsExporting(true);
    
    const currentDate = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Create PDF wrapper with custom styling
    const pdfWrapper = document.createElement('div');
    pdfWrapper.innerHTML = `
      <style>
        * {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          box-sizing: border-box;
        }
        .pdf-container {
          padding: 40px;
          background: #ffffff;
          color: #1a1a2e;
        }
        .pdf-header {
          text-align: center;
          margin-bottom: 40px;
          padding-bottom: 30px;
          border-bottom: 3px solid #3b82f6;
        }
        .pdf-logo {
          font-size: 32px;
          font-weight: bold;
          color: #3b82f6;
          margin-bottom: 8px;
        }
        .pdf-title {
          font-size: 24px;
          color: #374151;
          margin-bottom: 8px;
        }
        .pdf-date {
          font-size: 14px;
          color: #6b7280;
        }
        .pdf-section {
          margin-bottom: 35px;
          page-break-inside: avoid;
        }
        .pdf-section-title {
          font-size: 18px;
          font-weight: bold;
          color: #1e40af;
          margin-bottom: 20px;
          padding-bottom: 8px;
          border-bottom: 2px solid #e5e7eb;
        }
        .pdf-metrics-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
          margin-bottom: 20px;
        }
        .pdf-metric-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
        }
        .pdf-metric-label {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .pdf-metric-value {
          font-size: 18px;
          font-weight: bold;
          color: #1e293b;
        }
        .pdf-metric-highlight {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: white;
        }
        .pdf-metric-highlight .pdf-metric-label {
          color: rgba(255,255,255,0.8);
        }
        .pdf-metric-highlight .pdf-metric-value {
          color: white;
        }
        .pdf-margins-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
        }
        .pdf-margins-table th,
        .pdf-margins-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        .pdf-margins-table th {
          background: #f1f5f9;
          font-weight: 600;
          color: #475569;
          font-size: 13px;
        }
        .pdf-margins-table td {
          font-size: 14px;
          color: #374151;
        }
        .pdf-progress-bar {
          background: #e5e7eb;
          border-radius: 4px;
          height: 8px;
          overflow: hidden;
        }
        .pdf-progress-fill {
          height: 100%;
          border-radius: 4px;
        }
        .pdf-progress-blue { background: #3b82f6; }
        .pdf-progress-green { background: #10b981; }
        .pdf-progress-purple { background: #8b5cf6; }
        .pdf-insight {
          background: #f0fdf4;
          border-left: 4px solid #22c55e;
          padding: 12px 16px;
          margin-bottom: 10px;
          font-size: 14px;
          color: #166534;
          border-radius: 0 6px 6px 0;
        }
        .pdf-footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 2px solid #e5e7eb;
          text-align: center;
          font-size: 12px;
          color: #9ca3af;
        }
        .pdf-footer-brand {
          font-weight: 600;
          color: #3b82f6;
        }
      </style>
      <div class="pdf-container">
        <div class="pdf-header">
          <div class="pdf-logo">📊 ProCont</div>
          <div class="pdf-title">Relatório de Resultados Financeiros</div>
          <div class="pdf-date">Gerado em: ${currentDate}</div>
        </div>

        <div class="pdf-section">
          <div class="pdf-section-title">📈 Demonstração do Resultado (DRE)</div>
          <div class="pdf-metrics-grid">
            <div class="pdf-metric-card pdf-metric-highlight">
              <div class="pdf-metric-label">Receita Bruta</div>
              <div class="pdf-metric-value">${dreData?.receitaBruta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Receita Líquida</div>
              <div class="pdf-metric-value">${dreData?.receitaLiquida.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">CMV / Custos</div>
              <div class="pdf-metric-value">${dreData?.cmv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Lucro Bruto</div>
              <div class="pdf-metric-value">${dreData?.lucroBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Despesas Operacionais</div>
              <div class="pdf-metric-value">${dreData?.despesasOperacionais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Lucro Operacional</div>
              <div class="pdf-metric-value">${dreData?.lucroOperacional.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Resultado Financeiro</div>
              <div class="pdf-metric-value">${dreData?.resultadoFinanceiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card pdf-metric-highlight">
              <div class="pdf-metric-label">Lucro Líquido</div>
              <div class="pdf-metric-value">${dreData?.lucroLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
          </div>
          
          <table class="pdf-margins-table">
            <thead>
              <tr>
                <th>Indicador</th>
                <th>Valor</th>
                <th>Análise</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Margem Bruta</td>
                <td><strong>${dreData?.margemBruta.toFixed(2)}%</strong></td>
                <td>
                  <div class="pdf-progress-bar">
                    <div class="pdf-progress-fill pdf-progress-purple" style="width: ${Math.min(dreData?.margemBruta || 0, 100)}%"></div>
                  </div>
                </td>
              </tr>
              <tr>
                <td>Margem Operacional</td>
                <td><strong>${dreData?.margemOperacional.toFixed(2)}%</strong></td>
                <td>
                  <div class="pdf-progress-bar">
                    <div class="pdf-progress-fill pdf-progress-blue" style="width: ${Math.min(dreData?.margemOperacional || 0, 100)}%"></div>
                  </div>
                </td>
              </tr>
              <tr>
                <td>Margem Líquida</td>
                <td><strong>${dreData?.margemLiquida.toFixed(2)}%</strong></td>
                <td>
                  <div class="pdf-progress-bar">
                    <div class="pdf-progress-fill pdf-progress-green" style="width: ${Math.min(dreData?.margemLiquida || 0, 100)}%"></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pdf-section">
          <div class="pdf-section-title">⚖️ Balanço Patrimonial</div>
          <div class="pdf-metrics-grid">
            <div class="pdf-metric-card pdf-metric-highlight">
              <div class="pdf-metric-label">Ativo Total</div>
              <div class="pdf-metric-value">${balancoData?.ativoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Passivo Total</div>
              <div class="pdf-metric-value">${balancoData?.passivoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div class="pdf-metric-card">
              <div class="pdf-metric-label">Patrimônio Líquido</div>
              <div class="pdf-metric-value">${balancoData?.patrimonioLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
          </div>

          <table class="pdf-margins-table">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Valor</th>
                <th>% do Ativo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Ativo Circulante</td>
                <td>${balancoData?.ativoCirculante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${balancoData?.ativoTotal ? ((balancoData.ativoCirculante / balancoData.ativoTotal) * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td>Ativo Não Circulante</td>
                <td>${balancoData?.ativoNaoCirculante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${balancoData?.ativoTotal ? ((balancoData.ativoNaoCirculante / balancoData.ativoTotal) * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td>Passivo Circulante</td>
                <td>${balancoData?.passivoCirculante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${balancoData?.ativoTotal ? ((balancoData.passivoCirculante / balancoData.ativoTotal) * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td>Passivo Não Circulante</td>
                <td>${balancoData?.passivoNaoCirculante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${balancoData?.ativoTotal ? ((balancoData.passivoNaoCirculante / balancoData.ativoTotal) * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td><strong>Patrimônio Líquido</strong></td>
                <td><strong>${balancoData?.patrimonioLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
                <td><strong>${balancoData?.ativoTotal ? ((balancoData.patrimonioLiquido / balancoData.ativoTotal) * 100).toFixed(1) : 0}%</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pdf-section">
          <div class="pdf-section-title">💡 Insights e Recomendações</div>
          ${insights.map(insight => `<div class="pdf-insight">${insight}</div>`).join('')}
        </div>

        <div class="pdf-footer">
          <div class="pdf-footer-brand">Gerado por ProCont</div>
          <div>Sistema de Análise Financeira Contábil</div>
        </div>
      </div>
    `;

    const opt = {
      margin: 10,
      filename: `relatorio-procont-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().from(pdfWrapper).set(opt).save();
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando análise...</p>
        </div>
      </div>
    );
  }

  if (!dreData || !balancoData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Nenhum dado encontrado.</p>
          <Link to="/upload">
            <Button variant="hero">Fazer Upload</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background effects */}
      <div className="hero-glow w-full h-[400px] top-0 left-0" />

      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-6 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-4">
          <Link to="/upload">
            <Button variant="ghost" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Nova Análise
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
          <Link to="/">
            <Button variant="glass" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Início
            </Button>
          </Link>
        </div>
      </nav>

      <main className="relative z-10 container mx-auto px-6 py-12">
        {/* Header */}
        <div className="max-w-4xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
            <span className="text-sm text-green-400 font-medium">
              ✓ Análise Concluída
            </span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Resultado da <span className="gradient-text">Análise Financeira</span>
          </h1>
          <p className="text-muted-foreground">
            Dados extraídos e processados dos seus arquivos de DRE e Balanço Patrimonial.
          </p>
        </div>

        {/* DRE Section */}
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-primary" />
            Demonstração do Resultado (DRE)
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              title="Receita Bruta"
              value={dreData.receitaBruta}
              icon={DollarSign}
              variant="highlight"
            />
            <MetricCard
              title="Receita Líquida"
              value={dreData.receitaLiquida}
              icon={Wallet}
            />
            <MetricCard
              title="CMV / Custos"
              value={dreData.cmv}
              icon={Receipt}
            />
            <MetricCard
              title="Lucro Bruto"
              value={dreData.lucroBruto}
              icon={PiggyBank}
              variant="accent"
            />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              title="Despesas Operacionais"
              value={dreData.despesasOperacionais}
              icon={Calculator}
            />
            <MetricCard
              title="Lucro Operacional"
              value={dreData.lucroOperacional}
              icon={TrendingUp}
            />
            <MetricCard
              title="Resultado Financeiro"
              value={dreData.resultadoFinanceiro}
              icon={Scale}
            />
            <MetricCard
              title="Lucro Líquido"
              value={dreData.lucroLiquido}
              icon={TrendingUp}
              variant="highlight"
            />
          </div>

          {/* Margins */}
          <div className="glass-card p-6">
            <h3 className="font-display font-semibold mb-4">Margens</h3>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <ProgressBar
                  label="Margem Bruta"
                  value={dreData.margemBruta}
                  variant="purple"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {dreData.margemBruta.toFixed(2)}%
                </p>
              </div>
              <div>
                <ProgressBar
                  label="Margem Operacional"
                  value={dreData.margemOperacional}
                  variant="blue"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {dreData.margemOperacional.toFixed(2)}%
                </p>
              </div>
              <div>
                <ProgressBar
                  label="Margem Líquida"
                  value={dreData.margemLiquida}
                  variant="gradient"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {dreData.margemLiquida.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Balance Sheet Section */}
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
            <Scale className="w-6 h-6 text-secondary" />
            Balanço Patrimonial
          </h2>

          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <MetricCard
              title="Ativo Total"
              value={balancoData.ativoTotal}
              icon={Building}
              variant="highlight"
            />
            <MetricCard
              title="Passivo Total"
              value={balancoData.passivoTotal}
              icon={Scale}
            />
            <MetricCard
              title="Patrimônio Líquido"
              value={balancoData.patrimonioLiquido}
              icon={Landmark}
              variant="accent"
            />
          </div>


          <div className="grid md:grid-cols-2 gap-6">
            {/* Ativo Breakdown */}
            <div className="glass-card p-6">
              <h3 className="font-display font-semibold mb-4">Composição do Ativo</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Ativo Circulante</span>
                    <span className="text-foreground">
                      {balancoData.ativoCirculante.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                    </span>
                  </div>
                  <ProgressBar
                    value={balancoData.ativoTotal > 0 ? (balancoData.ativoCirculante / balancoData.ativoTotal) * 100 : 0}
                    showPercentage={false}
                    variant="purple"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Ativo Não Circulante</span>
                    <span className="text-foreground">
                      {balancoData.ativoNaoCirculante.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                    </span>
                  </div>
                  <ProgressBar
                    value={balancoData.ativoTotal > 0 ? (balancoData.ativoNaoCirculante / balancoData.ativoTotal) * 100 : 0}
                    showPercentage={false}
                    variant="blue"
                  />
                </div>
              </div>
            </div>

            {/* Passivo Breakdown */}
            <div className="glass-card p-6">
              <h3 className="font-display font-semibold mb-4">Estrutura de Capital</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Passivo Circulante</span>
                    <span className="text-foreground">
                      {balancoData.passivoCirculante.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                    </span>
                  </div>
                  <ProgressBar
                    value={balancoData.ativoTotal > 0 ? (balancoData.passivoCirculante / balancoData.ativoTotal) * 100 : 0}
                    showPercentage={false}
                    variant="purple"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Passivo Não Circulante</span>
                    <span className="text-foreground">
                      {balancoData.passivoNaoCirculante.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                    </span>
                  </div>
                  <ProgressBar
                    value={balancoData.ativoTotal > 0 ? (balancoData.passivoNaoCirculante / balancoData.ativoTotal) * 100 : 0}
                    showPercentage={false}
                    variant="blue"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Patrimônio Líquido</span>
                    <span className="text-foreground">
                      {balancoData.patrimonioLiquido.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL"
                      })}
                    </span>
                  </div>
                  <ProgressBar
                    value={balancoData.ativoTotal > 0 ? (balancoData.patrimonioLiquido / balancoData.ativoTotal) * 100 : 0}
                    showPercentage={false}
                    variant="gradient"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Diagnóstico de Importação Section */}
        {diagnosticLines.length > 0 && (
          <section className="mb-12">
            <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-3">
              🔍 Diagnóstico de Importação
            </h2>
            <div className="glass-card p-6">
              <p className="text-sm text-muted-foreground mb-4">
                Linhas de totais encontradas no arquivo e valores importados:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Conta</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Seção</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Tipo</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Valor</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticLines.map((line, index) => (
                      <tr key={index} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium text-foreground">{line.conta}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            line.secao === 'ATIVO' 
                              ? 'bg-blue-500/20 text-blue-400' 
                              : line.secao === 'PASSIVO'
                                ? 'bg-orange-500/20 text-orange-400'
                                : line.secao === 'PL'
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-muted text-muted-foreground'
                          }`}>
                            {line.secao}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-foreground text-xs">{line.tipoClassificado}</td>
                        <td className="py-2 px-3 text-right text-foreground">
                          {line.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {line.encontrado 
                            ? <span className="text-green-400">✓</span>
                            : <span className="text-red-400">✗</span>
                          }
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs max-w-xs truncate" title={line.motivo}>
                          {line.motivo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* XLS Validation Mode */}
        {validationRows.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-bold flex items-center gap-3">
                <FileSearch className="w-6 h-6 text-primary" />
                Validação XLS
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowValidation(!showValidation)}
              >
                <FileSearch className="w-4 h-4 mr-2" />
                {showValidation ? "Ocultar" : "Ver"} Validação ({validationRows.length} linhas)
              </Button>
            </div>
            {showValidation && (
              <XLSValidationMode
                rows={validationRows}
                filename={validationFilename}
                onClose={() => setShowValidation(false)}
              />
            )}
          </section>
        )}

        {/* Insights Section */}
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold mb-6">
            💡 Insights Automáticos
          </h2>
          <div className="glass-card p-6 space-y-4">
            {insights.map((insight, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border/50"
              >
                <p className="text-foreground">{insight}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Export PDF Button */}
        <section className="mb-12">
          <div className="glass-card p-8 text-center">
            <h3 className="font-display text-xl font-bold mb-3">
              📄 Exportar Relatório
            </h3>
            <p className="text-muted-foreground mb-6">
              Gere um PDF profissional com todos os dados desta análise para enviar aos seus clientes.
            </p>
            <Button 
              variant="hero" 
              size="xl" 
              onClick={handleExportPDF}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <FileDown className="w-5 h-5 mr-2" />
                  Exportar relatório em PDF
                </>
              )}
            </Button>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            Deseja analisar outro cliente?
          </p>
          <Link to="/upload">
            <Button variant="hero" size="xl">
              <RefreshCw className="w-5 h-5 mr-2" />
              Nova Análise
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Resultado;
