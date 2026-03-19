import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmpresaContext {
  nome: string;
  cnpj: string;
  cnae: string;
  regime_tributario: string;
  contexto: string | null;
}

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
  empresa?: EmpresaContext;
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

    const { dre, balanco } = (await req.json()) as FinancialData;
    
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
    
    const endividamentoGeral = balanco.ativoTotal > 0
      ? ((balanco.passivoCirculante + balanco.passivoNaoCirculante) / balanco.ativoTotal) * 100
      : 0;

    const roa = balanco.ativoTotal > 0
      ? (dre.lucroLiquido / balanco.ativoTotal) * 100
      : 0;

    const roe = balanco.patrimonioLiquido > 0
      ? (dre.lucroLiquido / balanco.patrimonioLiquido) * 100
      : 0;

    const systemPrompt = `Você é um especialista em análise financeira e contabilidade brasileira. Seu papel é analisar demonstrativos financeiros (DRE e Balanço Patrimonial) e fornecer insights estratégicos para empresas.

Responda SEMPRE em português brasileiro. Seja direto, profissional e forneça recomendações acionáveis.

Use formatação markdown para estruturar sua resposta:
- Use ## para títulos de seção
- Use **negrito** para destacar valores importantes
- Use listas com - para pontos importantes
- Use > para citações ou alertas importantes`;

    const userPrompt = `Analise os seguintes dados financeiros de uma empresa brasileira e forneça insights estratégicos detalhados:

## DRE (Demonstração do Resultado do Exercício)
- Receita Bruta: ${formatCurrency(dre.receitaBruta)}
- Receita Líquida: ${formatCurrency(dre.receitaLiquida)}
- CMV (Custo das Mercadorias Vendidas): ${formatCurrency(dre.cmv)}
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
- Endividamento Geral: ${formatPercent(endividamentoGeral)}
- ROA (Retorno sobre Ativos): ${formatPercent(roa)}
- ROE (Retorno sobre PL): ${formatPercent(roe)}

Por favor, forneça uma análise completa incluindo:

1. **Resumo Executivo**: Visão geral da saúde financeira da empresa (2-3 frases)

2. **Análise de Rentabilidade**: Avalie as margens e identifique pontos de atenção

3. **Análise de Liquidez e Solvência**: Avalie a capacidade de pagamento

4. **Estrutura de Capital**: Analise o nível de endividamento e alavancagem

5. **Pontos Fortes**: Liste 2-3 aspectos positivos

6. **Pontos de Atenção**: Liste 2-3 riscos ou áreas que precisam de melhoria

7. **Recomendações**: 3-5 ações estratégicas específicas que a empresa deveria considerar

Seja específico e use os números fornecidos para fundamentar suas análises.`;

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
    console.error("analyze-financials error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
