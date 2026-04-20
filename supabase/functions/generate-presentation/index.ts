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
  empresaCnpj?: string;
  empresaCnae?: string;
  empresaRegimeTributario?: string;
  empresaContexto?: string;
  ebitda?: number;
  periodo?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const {
      dre,
      balanco,
      empresaNome = "Empresa",
      empresaCnpj,
      empresaCnae,
      empresaRegimeTributario,
      empresaContexto,
      ebitda,
      periodo,
    } = (await req.json()) as FinancialData;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const formatCurrency = (value: number) =>
      value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const formatPercent = (value: number) => `${value.toFixed(2)}%`;

    // Indicators
    const liquidezCorrente = balanco.passivoCirculante > 0
      ? balanco.ativoCirculante / balanco.passivoCirculante
      : 0;

    const liquidezSeca = balanco.passivoCirculante > 0
      ? (balanco.ativoCirculante * 0.7) / balanco.passivoCirculante
      : 0;

    const liquidezGeral = (balanco.passivoCirculante + balanco.passivoNaoCirculante) > 0
      ? (balanco.ativoCirculante + balanco.ativoNaoCirculante) / (balanco.passivoCirculante + balanco.passivoNaoCirculante)
      : 0;

    const endividamentoGeral = balanco.ativoTotal > 0
      ? ((balanco.passivoCirculante + balanco.passivoNaoCirculante) / balanco.ativoTotal) * 100
      : 0;

    const concentracaoCP = (balanco.passivoCirculante + balanco.passivoNaoCirculante) > 0
      ? (balanco.passivoCirculante / (balanco.passivoCirculante + balanco.passivoNaoCirculante)) * 100
      : 0;

    const plSobreAtivo = balanco.ativoTotal > 0
      ? (balanco.patrimonioLiquido / balanco.ativoTotal) * 100
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

    const ebitdaMargin = (dre.receitaLiquida > 0 && ebitda)
      ? (ebitda / dre.receitaLiquida) * 100
      : 0;

    const empresaEmDificuldade = dre.lucroLiquido < 0 || balanco.patrimonioLiquido < 0 || liquidezCorrente < 1;

    const systemPrompt = `Você é um contador e consultor financeiro sênior brasileiro, especialista em análise de demonstrativos contábeis. Sua tarefa é gerar conteúdo para um relatório executivo profissional.

REGRAS CRÍTICAS — leia com atenção:
1. Nunca contradiga os dados: se a liquidez corrente for < 1,0, ela é RUIM, não "adequada". Se o lucro for negativo, é PREJUÍZO.
2. Se a empresa está em situação negativa (prejuízo, PL negativo, liquidez < 1), adapte os Pontos Fortes: liste aspectos relativamente positivos (ex: geração operacional de caixa, giro do ativo, EBITDA positivo) ou capacidades a desenvolver. NUNCA retorne pontosFortes como array vazio [].
3. Cada recomendação deve ter: TÍTULO CURTO + descrição explicativa diferente do título. Nunca repita o título como descrição.
4. Use os números exatos fornecidos. Arredonde percentuais para 2 casas decimais.
5. Contextualize pelo setor (CNAE) sempre que disponível.
${empresaEmDificuldade ? '6. ATENÇÃO: Esta empresa está em situação financeira crítica. Seja honesto mas construtivo. Não minimize os problemas, mas aponte caminhos de recuperação.' : ''}

Retorne APENAS um objeto JSON válido, sem texto antes ou depois, seguindo EXATAMENTE esta estrutura:

{
  "resumo": {
    "paragrafo1": "Parágrafo contextualizado com nome da empresa, setor e resultado geral (3-4 frases)",
    "paragrafo2": "Análise da estrutura patrimonial e capital (2-3 frases)",
    "paragrafo3": "Principal ponto de atenção ou destaque (1-2 frases)"
  },
  "analiseRentabilidade": {
    "paragrafo1": "Análise das margens com interpretação setorial (3 frases)",
    "paragrafo2": "Análise das despesas operacionais detalhada (2-3 frases)",
    "paragrafo3": "Resultado financeiro e impacto no resultado (2 frases)"
  },
  "analisePatrimonial": {
    "paragrafo1": "Análise do ativo circulante e capital de giro (3 frases)",
    "paragrafo2": "Análise da estrutura de financiamento: PL vs passivo (2-3 frases)"
  },
  "pontosFortes": [
    { "titulo": "Título curto (3-5 palavras)", "descricao": "Descrição analítica de 2-3 frases com valores numéricos específicos." },
    { "titulo": "Título curto (3-5 palavras)", "descricao": "Descrição analítica de 2-3 frases com valores numéricos específicos." },
    { "titulo": "Título curto (3-5 palavras)", "descricao": "Descrição analítica de 2-3 frases com valores numéricos específicos." }
  ],
  "pontosAtencao": [
    { "titulo": "Título curto (3-5 palavras)", "descricao": "Descrição da causa, impacto e magnitude do problema com valores numéricos. 2-3 frases." },
    { "titulo": "Título curto (3-5 palavras)", "descricao": "Descrição da causa, impacto e magnitude do problema com valores numéricos. 2-3 frases." },
    { "titulo": "Título curto (3-5 palavras)", "descricao": "Descrição da causa, impacto e magnitude do problema com valores numéricos. 2-3 frases." }
  ],
  "recomendacoes": [
    { "numero": 1, "titulo": "Verbo + Ação Específica", "prioridade": "ALTA PRIORIDADE", "descricao": "Descrição detalhada com ação concreta, valores estimados de impacto e prazo sugerido. 3-4 frases." },
    { "numero": 2, "titulo": "Verbo + Ação Específica", "prioridade": "MÉDIA PRIORIDADE", "descricao": "Descrição detalhada com ação concreta, valores estimados de impacto e prazo sugerido. 3-4 frases." },
    { "numero": 3, "titulo": "Verbo + Ação Específica", "prioridade": "MÉDIA PRIORIDADE", "descricao": "Descrição detalhada com ação concreta, valores estimados de impacto e prazo sugerido. 3-4 frases." },
    { "numero": 4, "titulo": "Verbo + Ação Específica", "prioridade": "BAIXA PRIORIDADE", "descricao": "Descrição detalhada com ação concreta, valores estimados de impacto e prazo sugerido. 3-4 frases." },
    { "numero": 5, "titulo": "Verbo + Ação Específica", "prioridade": "BAIXA PRIORIDADE", "descricao": "Descrição detalhada com ação concreta, valores estimados de impacto e prazo sugerido. 3-4 frases." }
  ],
  "conclusao": {
    "paragrafo1": "Síntese coerente com os dados reais, mencionando os 3 principais indicadores. 3-4 frases.",
    "paragrafo2": "Pontos de atenção gerenciáveis e prioridades para o próximo exercício. 2-3 frases."
  }
}`;

    const userPrompt = `Gere o relatório executivo para ${empresaNome} (CNPJ: ${empresaCnpj || 'não informado'})${empresaCnae ? `, CNAE ${empresaCnae}` : ''}${empresaRegimeTributario ? `, regime ${empresaRegimeTributario}` : ''}.
${empresaContexto ? `Contexto do setor: ${empresaContexto}` : ''}
${periodo ? `Período: ${periodo}` : ''}

## DRE
- Receita Bruta: ${formatCurrency(dre.receitaBruta)}
- Deduções: ${formatCurrency(dre.receitaBruta - dre.receitaLiquida)}
- Receita Líquida: ${formatCurrency(dre.receitaLiquida)}
- CMV / Custo dos Serviços: ${formatCurrency(dre.cmv)}
- Lucro Bruto: ${formatCurrency(dre.lucroBruto)} (Margem: ${formatPercent(dre.margemBruta)})
- Despesas Operacionais: ${formatCurrency(dre.despesasOperacionais)}
- Lucro Operacional (EBIT): ${formatCurrency(dre.lucroOperacional)} (Margem: ${formatPercent(dre.margemOperacional)})
- Resultado Financeiro: ${formatCurrency(dre.resultadoFinanceiro)}
${ebitda ? `- EBITDA: ${formatCurrency(ebitda)} (Margem EBITDA: ${formatPercent(ebitdaMargin)})` : ''}
- ${dre.lucroLiquido < 0 ? 'PREJUÍZO' : 'Lucro'} Líquido: ${formatCurrency(dre.lucroLiquido)} (Margem: ${formatPercent(dre.margemLiquida)})

## Balanço Patrimonial
- Ativo Circulante: ${formatCurrency(balanco.ativoCirculante)} (${balanco.ativoTotal > 0 ? formatPercent(balanco.ativoCirculante / balanco.ativoTotal * 100) : '0%'} do ativo)
- Ativo Não Circulante: ${formatCurrency(balanco.ativoNaoCirculante)} (${balanco.ativoTotal > 0 ? formatPercent(balanco.ativoNaoCirculante / balanco.ativoTotal * 100) : '0%'} do ativo)
- Ativo Total: ${formatCurrency(balanco.ativoTotal)}
- Passivo Circulante: ${formatCurrency(balanco.passivoCirculante)}
- Passivo Não Circulante: ${formatCurrency(balanco.passivoNaoCirculante)}
- ${balanco.patrimonioLiquido < 0 ? 'PATRIMÔNIO LÍQUIDO NEGATIVO (PASSIVO A DESCOBERTO)' : 'Patrimônio Líquido'}: ${formatCurrency(balanco.patrimonioLiquido)}

## Indicadores
- Liquidez Corrente: ${liquidezCorrente.toFixed(2)} (referência: > 1,5) → ${liquidezCorrente >= 1.5 ? 'ADEQUADA' : liquidezCorrente >= 1.0 ? 'ATENÇÃO' : 'CRÍTICA'}
- Liquidez Seca: ${liquidezSeca.toFixed(2)}
- Liquidez Geral: ${liquidezGeral.toFixed(2)}
- Endividamento Geral: ${formatPercent(endividamentoGeral)} (referência: < 50%)
- Concentração CP: ${formatPercent(concentracaoCP)}
- PL / Ativo: ${formatPercent(plSobreAtivo)}
- ROA: ${formatPercent(roa)}
- ROE: ${roe === 0 && balanco.patrimonioLiquido <= 0 ? 'N/A (PL negativo)' : formatPercent(roe)}
- Giro do Ativo: ${giroAtivo.toFixed(2)}x`;

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
