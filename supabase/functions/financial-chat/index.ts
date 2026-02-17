import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DREEntryDetail {
  descricao: string;
  valor: number;
  grupo: string;
}

interface BalancoEntryDetail {
  conta: string;
  valor: number;
  tipo: string;
  hierarchy: string;
}

interface EmpresaContext {
  nome: string;
  cnpj: string;
  cnae: string;
  regime_tributario: string;
  contexto: string | null;
}

interface FinancialContext {
  dre: {
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
  };
  balanco: {
    ativoCirculante: number;
    ativoNaoCirculante: number;
    ativoTotal: number;
    passivoCirculante: number;
    passivoNaoCirculante: number;
    passivoTotal: number;
    patrimonioLiquido: number;
  };
  dreEntries?: DREEntryDetail[];
  balancoEntries?: BalancoEntryDetail[];
  empresa?: EmpresaContext;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, financialContext } = await req.json() as { 
      messages: ChatMessage[]; 
      financialContext: FinancialContext;
    };
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Format currency for context
    const formatCurrency = (value: number) => 
      value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const formatPercent = (value: number) => 
      `${value.toFixed(2)}%`;

    // Calculate additional indicators
    const { dre, balanco } = financialContext;
    
    const liquidezCorrente = balanco.passivoCirculante > 0 
      ? balanco.ativoCirculante / balanco.passivoCirculante 
      : 0;
    
    const endividamentoGeral = balanco.ativoTotal > 0
      ? ((balanco.passivoCirculante + balanco.passivoNaoCirculante) / balanco.ativoTotal) * 100
      : 0;

    const roa = balanco.ativoTotal > 0
      ? (dre.lucroLiquido / balanco.ativoTotal) * 100
      : 0;

    const roe = balanco.patrimonioLiquido > 0
      ? (dre.lucroLiquido / balanco.patrimonioLiquido) * 100
      : 0;

    // Build individual entries sections
    const dreEntriesSection = financialContext.dreEntries?.length
      ? `\n### Contas Individuais da DRE\n${financialContext.dreEntries
          .map(e => `- [${e.grupo}] ${e.descricao}: ${formatCurrency(e.valor)}`)
          .join('\n')}`
      : '';

    const balancoEntriesSection = financialContext.balancoEntries?.length
      ? `\n### Contas Individuais do Balanço\n${financialContext.balancoEntries
          .map(e => `- [${e.tipo}${e.hierarchy ? ` > ${e.hierarchy}` : ''}] ${e.conta}: ${formatCurrency(e.valor)}`)
          .join('\n')}`
      : '';

    // Build empresa context section
    const empresaSection = financialContext.empresa
      ? `\n## Dados da Empresa
- Nome: ${financialContext.empresa.nome}
- CNPJ: ${financialContext.empresa.cnpj}
${financialContext.empresa.cnae ? `- CNAE: ${financialContext.empresa.cnae}` : ''}
${financialContext.empresa.regime_tributario ? `- Regime Tributário: ${financialContext.empresa.regime_tributario}` : ''}
${financialContext.empresa.contexto ? `- Contexto: ${financialContext.empresa.contexto}` : ''}\n`
      : '';

    const systemPrompt = `Você é um simulador de cenários financeiros para empresas brasileiras. Seu ÚNICO propósito é fazer simulações e projeções financeiras baseadas nos dados reais da empresa abaixo.

## REGRAS OBRIGATÓRIAS
1. Você SOMENTE responde perguntas relacionadas a simulações e cenários financeiros da empresa.
2. Se o usuário perguntar qualquer coisa que NÃO seja sobre finanças, contabilidade, indicadores, projeções, simulações ou cenários financeiros da empresa, responda EXATAMENTE:
   "⚠️ Desculpe, sou um simulador de cenários financeiros. Só posso ajudar com perguntas sobre simulações e projeções financeiras da empresa. Exemplos:
   - *Se meu CMV diminuir 20%, como isso afeta o lucro?*
   - *O que acontece se a receita aumentar 15%?*
   - *Simule um cenário onde as despesas operacionais caem 10%*"
3. NÃO responda perguntas sobre: clima, esportes, receitas, política, tecnologia, entretenimento, saúde, viagens, ou qualquer tema fora de finanças empresariais.
4. NÃO gere código, textos criativos, poemas, histórias ou conteúdo não financeiro.
5. Sempre baseie suas respostas nos dados financeiros concretos da empresa listados abaixo.
6. Você tem acesso às contas individuais da DRE e do Balanço. Use-as para análises detalhadas quando o usuário perguntar sobre contas específicas.
7. Use o contexto da empresa (setor, regime tributário, CNAE) para dar respostas mais relevantes ao setor de atuação.
${empresaSection}

## Dados Financeiros Atuais da Empresa

### DRE (Demonstração do Resultado) — Totais
- Receita Bruta: ${formatCurrency(dre.receitaBruta)}
- Receita Líquida: ${formatCurrency(dre.receitaLiquida)}
- CMV (Custo das Mercadorias): ${formatCurrency(dre.cmv)}
- Lucro Bruto: ${formatCurrency(dre.lucroBruto)}
- Despesas Operacionais: ${formatCurrency(dre.despesasOperacionais)}
- Lucro Operacional: ${formatCurrency(dre.lucroOperacional)}
- Resultado Financeiro: ${formatCurrency(dre.resultadoFinanceiro)}
- Lucro Líquido: ${formatCurrency(dre.lucroLiquido)}
- Margem Bruta: ${formatPercent(dre.margemBruta)}
- Margem Operacional: ${formatPercent(dre.margemOperacional)}
- Margem Líquida: ${formatPercent(dre.margemLiquida)}
${dreEntriesSection}

### Balanço Patrimonial — Totais
- Ativo Circulante: ${formatCurrency(balanco.ativoCirculante)}
- Ativo Não Circulante: ${formatCurrency(balanco.ativoNaoCirculante)}
- Ativo Total: ${formatCurrency(balanco.ativoTotal)}
- Passivo Circulante: ${formatCurrency(balanco.passivoCirculante)}
- Passivo Não Circulante: ${formatCurrency(balanco.passivoNaoCirculante)}
- Patrimônio Líquido: ${formatCurrency(balanco.patrimonioLiquido)}
${balancoEntriesSection}

### Indicadores Calculados
- Liquidez Corrente: ${liquidezCorrente.toFixed(2)}
- Endividamento Geral: ${formatPercent(endividamentoGeral)}
- ROA: ${formatPercent(roa)}
- ROE: ${formatPercent(roe)}

## Instruções de Resposta
1. Sempre responda em português brasileiro
2. Use os dados financeiros acima para fazer cálculos e projeções precisas
3. Quando o usuário perguntar sobre mudanças (ex: "se o CMV diminuir 20%"), calcule o impacto real usando os valores
4. Apresente os resultados de forma clara com comparativos antes/depois
5. Use formatação markdown para estruturar a resposta
6. Seja direto e objetivo, mas explique o raciocínio
7. Destaque impactos positivos com ✅ e negativos com ⚠️
8. Quando relevante, mencione contas individuais para dar mais profundidade à análise`;
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao seu workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao conectar com o serviço de IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("financial-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
