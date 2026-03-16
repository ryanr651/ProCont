import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FinancialData {
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
  empresaNome?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: authError } = await _sb.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { dre, balanco, empresaNome = "Empresa" } = (await req.json()) as FinancialData;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Format currency for the prompt
    const formatCurrency = (value: number) => 
      value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const formatPercent = (value: number) => 
      `${value.toFixed(2)}%`;

    // Calculate additional indicators
    const liquidezCorrente = balanco.passivoCirculante > 0 
      ? balanco.ativoCirculante / balanco.passivoCirculante 
      : 0;
    
    const liquidezSeca = balanco.passivoCirculante > 0 
      ? (balanco.ativoCirculante * 0.7) / balanco.passivoCirculante // Estimativa sem estoque
      : 0;
    
    const endividamentoGeral = balanco.ativoTotal > 0
      ? ((balanco.passivoCirculante + balanco.passivoNaoCirculante) / balanco.ativoTotal) * 100
      : 0;

    const composicaoEndividamento = (balanco.passivoCirculante + balanco.passivoNaoCirculante) > 0
      ? (balanco.passivoCirculante / (balanco.passivoCirculante + balanco.passivoNaoCirculante)) * 100
      : 0;

    const roa = balanco.ativoTotal > 0
      ? (dre.lucroLiquido / balanco.ativoTotal) * 100
      : 0;

    const roe = balanco.patrimonioLiquido > 0
      ? (dre.lucroLiquido / balanco.patrimonioLiquido) * 100
      : 0;

    const giroAtivo = balanco.ativoTotal > 0
      ? dre.receitaLiquida / balanco.ativoTotal
      : 0;

    const systemPrompt = `Você é um consultor financeiro especialista em análises empresariais brasileiras. 
Sua tarefa é criar uma apresentação executiva estruturada baseada nos dados financeiros fornecidos.

IMPORTANTE: Você DEVE retornar APENAS um objeto JSON válido, sem texto adicional antes ou depois.

O JSON deve seguir EXATAMENTE esta estrutura:
{
  "resumo": ["ponto 1", "ponto 2", "ponto 3"],
  "rentabilidade": ["análise 1", "análise 2", "análise 3"],
  "liquidez": ["ponto 1", "ponto 2", "ponto 3"],
  "estrutura": ["ponto 1", "ponto 2"],
  "pontosFortes": ["força 1", "força 2", "força 3"],
  "pontosAtencao": ["risco 1", "risco 2", "risco 3"],
  "recomendacoes": ["recomendação 1", "recomendação 2", "recomendação 3", "recomendação 4"],
  "conclusao": ["conclusão principal"]
}

Cada item do array deve ser uma frase completa e profissional, focada em insights acionáveis.
Use os dados fornecidos para fundamentar cada ponto com números específicos.
Mantenha cada ponto conciso (máximo 2 frases).
Responda em português brasileiro.`;

    const userPrompt = `Gere uma apresentação executiva para ${empresaNome} com base nos seguintes dados:

## DRE (Demonstração do Resultado do Exercício)
- Receita Bruta: ${formatCurrency(dre.receitaBruta)}
- Receita Líquida: ${formatCurrency(dre.receitaLiquida)}
- CMV: ${formatCurrency(dre.cmv)}
- Lucro Bruto: ${formatCurrency(dre.lucroBruto)}
- Despesas Operacionais: ${formatCurrency(dre.despesasOperacionais)}
- Lucro Operacional: ${formatCurrency(dre.lucroOperacional)}
- Resultado Financeiro: ${formatCurrency(dre.resultadoFinanceiro)}
- Lucro Líquido: ${formatCurrency(dre.lucroLiquido)}
- Margem Bruta: ${formatPercent(dre.margemBruta)}
- Margem Operacional: ${formatPercent(dre.margemOperacional)}
- Margem Líquida: ${formatPercent(dre.margemLiquida)}

## Balanço Patrimonial
- Ativo Circulante: ${formatCurrency(balanco.ativoCirculante)}
- Ativo Não Circulante: ${formatCurrency(balanco.ativoNaoCirculante)}
- Ativo Total: ${formatCurrency(balanco.ativoTotal)}
- Passivo Circulante: ${formatCurrency(balanco.passivoCirculante)}
- Passivo Não Circulante: ${formatCurrency(balanco.passivoNaoCirculante)}
- Passivo Total: ${formatCurrency(balanco.passivoTotal)}
- Patrimônio Líquido: ${formatCurrency(balanco.patrimonioLiquido)}

## Indicadores Calculados
- Liquidez Corrente: ${liquidezCorrente.toFixed(2)}
- Liquidez Seca (estimada): ${liquidezSeca.toFixed(2)}
- Endividamento Geral: ${formatPercent(endividamentoGeral)}
- Composição do Endividamento: ${formatPercent(composicaoEndividamento)}
- ROA: ${formatPercent(roa)}
- ROE: ${formatPercent(roe)}
- Giro do Ativo: ${giroAtivo.toFixed(2)}x

Retorne APENAS o JSON estruturado conforme solicitado, sem nenhum texto adicional.`;

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
          { role: "user", content: userPrompt },
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

    // Return the stream directly
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("generate-presentation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
