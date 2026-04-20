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
  /** When true, return final JSON object directly (not SSE stream). */
  nonStreaming?: boolean;
}

const JSON_SCHEMA = `{
  "resumo": {
    "paragrafo1": "OBRIGATÓRIO 3-4 frases. Contextualize empresa, setor, resultado geral com valores numéricos.",
    "paragrafo2": "OBRIGATÓRIO 2-3 frases. Analise PL (se negativo, cite explicitamente como PASSIVO A DESCOBERTO), estrutura de capital e endividamento.",
    "paragrafo3": "OBRIGATÓRIO 2 frases. Principal risco ou destaque operacional."
  },
  "analiseRentabilidade": {
    "paragrafo1": "OBRIGATÓRIO 3 frases. Margens Bruta, Operacional e Líquida. Explique o que consome a receita.",
    "paragrafo2": "OBRIGATÓRIO 2-3 frases. Despesas operacionais: % da receita e impacto no EBIT.",
    "paragrafo3": "OBRIGATÓRIO 2 frases. Resultado financeiro (juros/encargos) e impacto no resultado final."
  },
  "analisePatrimonial": {
    "paragrafo1": "OBRIGATÓRIO 3 frases. Capital de giro: AC vs PC. Liquidez corrente X significa Y.",
    "paragrafo2": "OBRIGATÓRIO 2-3 frases. Estrutura de financiamento: terceiros vs próprio. Se PL negativo, explicar implicações."
  },
  "pontosFortes": [
    { "titulo": "Título 3-5 palavras", "descricao": "OBRIGATÓRIO 2-3 frases com valores numéricos." },
    { "titulo": "Título 3-5 palavras", "descricao": "OBRIGATÓRIO 2-3 frases com valores numéricos." },
    { "titulo": "Título 3-5 palavras", "descricao": "OBRIGATÓRIO 2-3 frases com valores numéricos." }
  ],
  "pontosAtencao": [
    { "titulo": "Título 3-5 palavras", "descricao": "OBRIGATÓRIO 2-3 frases. Causa, dado numérico e impacto." },
    { "titulo": "Título 3-5 palavras", "descricao": "OBRIGATÓRIO 2-3 frases. Causa, dado numérico e impacto." },
    { "titulo": "Título 3-5 palavras", "descricao": "OBRIGATÓRIO 2-3 frases. Causa, dado numérico e impacto." }
  ],
  "recomendacoes": [
    { "numero": 1, "titulo": "Verbo + objeto específico", "prioridade": "ALTA PRIORIDADE", "descricao": "OBRIGATÓRIO 3-4 frases DIFERENTES do título. Ação concreta, motivo (com valores), impacto esperado e prazo." },
    { "numero": 2, "titulo": "Verbo + objeto específico", "prioridade": "ALTA PRIORIDADE", "descricao": "OBRIGATÓRIO 3-4 frases DIFERENTES do título." },
    { "numero": 3, "titulo": "Verbo + objeto específico", "prioridade": "MÉDIA PRIORIDADE", "descricao": "OBRIGATÓRIO 3-4 frases DIFERENTES do título." },
    { "numero": 4, "titulo": "Verbo + objeto específico", "prioridade": "MÉDIA PRIORIDADE", "descricao": "OBRIGATÓRIO 3-4 frases DIFERENTES do título." },
    { "numero": 5, "titulo": "Verbo + objeto específico", "prioridade": "BAIXA PRIORIDADE", "descricao": "OBRIGATÓRIO 3-4 frases DIFERENTES do título." }
  ],
  "conclusao": {
    "paragrafo1": "OBRIGATÓRIO 3-4 frases. Síntese honesta e coerente. Se PL negativo, mencionar como passivo a descoberto. Se liquidez < 1, citar como crítica.",
    "paragrafo2": "OBRIGATÓRIO 2-3 frases. Prioridades concretas para o próximo exercício."
  },
  "avaliacaoGeral": {
    "rentabilidade":  { "estrelas": 1, "label": "CRÍTICA|PREOCUPANTE|REGULAR|BOA|EXCELENTE", "resumo": "frase com indicadores" },
    "liquidez":       { "estrelas": 1, "label": "CRÍTICA|PREOCUPANTE|REGULAR|BOA|EXCELENTE", "resumo": "frase com indicadores" },
    "endividamento":  { "estrelas": 1, "label": "CRÍTICA|PREOCUPANTE|REGULAR|BOA|EXCELENTE", "resumo": "frase com indicadores" },
    "atividade":      { "estrelas": 1, "label": "CRÍTICA|PREOCUPANTE|REGULAR|BOA|EXCELENTE", "resumo": "frase com indicadores" },
    "saudeGeral":     { "estrelas": 1, "label": "CRÍTICA|PREOCUPANTE|ATENÇÃO|BOA|SÓLIDA",   "resumo": "frase síntese" }
  }
}`;

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
      nonStreaming,
    } = (await req.json()) as FinancialData;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const brl = (v: number) => {
      const abs = Math.abs(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return v < 0 ? `-${abs}` : abs;
    };
    const pct = (v: number) => `${v.toFixed(2)}%`;

    // ── Indicadores ────────────────────────────────────────────
    const liquidezCorrente = balanco.passivoCirculante > 0
      ? balanco.ativoCirculante / balanco.passivoCirculante : 0;
    const liquidezSeca = balanco.passivoCirculante > 0
      ? (balanco.ativoCirculante * 0.7) / balanco.passivoCirculante : 0;
    const liquidezGeral = (balanco.passivoCirculante + balanco.passivoNaoCirculante) > 0
      ? (balanco.ativoCirculante + balanco.ativoNaoCirculante) / (balanco.passivoCirculante + balanco.passivoNaoCirculante) : 0;
    const endividamentoGeral = balanco.ativoTotal > 0
      ? ((balanco.passivoCirculante + balanco.passivoNaoCirculante) / balanco.ativoTotal) * 100 : 0;
    const concentracaoCP = (balanco.passivoCirculante + balanco.passivoNaoCirculante) > 0
      ? (balanco.passivoCirculante / (balanco.passivoCirculante + balanco.passivoNaoCirculante)) * 100 : 0;
    const plSobreAtivo = balanco.ativoTotal > 0
      ? (balanco.patrimonioLiquido / balanco.ativoTotal) * 100 : 0;
    const roa = balanco.ativoTotal > 0 ? (dre.lucroLiquido / balanco.ativoTotal) * 100 : 0;
    const roe = balanco.patrimonioLiquido > 0 ? (dre.lucroLiquido / balanco.patrimonioLiquido) * 100 : 0;
    const giroAtivo = balanco.ativoTotal > 0 ? dre.receitaLiquida / balanco.ativoTotal : 0;
    const ebitdaMargin = (dre.receitaLiquida > 0 && ebitda) ? (ebitda / dre.receitaLiquida) * 100 : 0;

    const plNegativo = balanco.patrimonioLiquido < 0;
    const situacaoCritica = dre.lucroLiquido < 0 && plNegativo && liquidezCorrente < 1;

    // ── System Prompt (estrito) ────────────────────────────────
    const systemPrompt = `Você é um contador sênior brasileiro especializado em análise de balanços e DRE.

REGRAS ABSOLUTAS — não viole nenhuma delas:
1. NUNCA deixe campos do JSON vazios ou com array vazio []. Se não houver pontos fortes claros, liste capacidades operacionais (EBITDA, giro, receita).
2. NUNCA chame de "adequada" ou "boa" uma liquidez corrente abaixo de 1,0. Abaixo de 0,5 é CRÍTICA.
3. NUNCA omita o sinal negativo de Patrimônio Líquido negativo. Use "-R$ X" e descreva como PASSIVO A DESCOBERTO.
4. NUNCA repita o título como descrição. Título e descrição devem ser textos diferentes.
5. Cada campo de texto deve ter no MÍNIMO 2 frases completas; parágrafos: 3-4 frases.
6. A "saudeGeral" da avaliacaoGeral deve refletir os dados reais. PL negativo + prejuízo + liquidez < 1 = situação CRÍTICA (1 estrela), nunca adequada.
7. As "estrelas" de avaliacaoGeral são inteiros de 1 a 5, calculados a partir dos indicadores.
${situacaoCritica ? '8. ⚠️ EMPRESA EM SITUAÇÃO CRÍTICA: seja honesto, sem minimizar.' : ''}

Retorne SOMENTE o JSON abaixo, sem nenhum texto antes ou depois, sem markdown, sem \`\`\`json:
${JSON_SCHEMA}`;

    // ── User Prompt (dados explícitos) ─────────────────────────
    const userPrompt = `Gere análise financeira completa para: ${empresaNome}${empresaCnpj ? ` (CNPJ ${empresaCnpj})` : ''}${empresaCnae ? `, CNAE ${empresaCnae}` : ''}${empresaRegimeTributario ? `, regime ${empresaRegimeTributario}` : ''}.
${empresaContexto ? `Contexto do setor: ${empresaContexto}` : ''}
${periodo ? `Período: ${periodo}` : ''}

⚠️ SITUAÇÃO: ${situacaoCritica ? 'EMPRESA EM SITUAÇÃO FINANCEIRA CRÍTICA' : 'empresa com pontos de atenção'}
${plNegativo ? `⚠️ PATRIMÔNIO LÍQUIDO NEGATIVO: ${brl(balanco.patrimonioLiquido)} (Passivo a Descoberto)` : ''}

DADOS DA DRE:
- Receita Bruta: ${brl(dre.receitaBruta)}
- Deduções: ${brl(dre.receitaBruta - dre.receitaLiquida)}
- Receita Líquida: ${brl(dre.receitaLiquida)}
- CMV/Custo Serviços: ${brl(dre.cmv)}
- Lucro Bruto: ${brl(dre.lucroBruto)} (${pct(dre.margemBruta)})
- Despesas Operacionais: ${brl(dre.despesasOperacionais)}
- EBIT: ${brl(dre.lucroOperacional)} (${pct(dre.margemOperacional)})
- Resultado Financeiro: ${brl(dre.resultadoFinanceiro)}
${ebitda ? `- EBITDA: ${brl(ebitda)} (${pct(ebitdaMargin)})` : ''}
- ${dre.lucroLiquido < 0 ? 'PREJUÍZO' : 'LUCRO'} LÍQUIDO: ${brl(dre.lucroLiquido)} (${pct(dre.margemLiquida)})

DADOS DO BALANÇO:
- Ativo Circulante: ${brl(balanco.ativoCirculante)}
- Ativo Não Circulante: ${brl(balanco.ativoNaoCirculante)}
- Ativo Total: ${brl(balanco.ativoTotal)}
- Passivo Circulante: ${brl(balanco.passivoCirculante)}
- Passivo Não Circulante: ${brl(balanco.passivoNaoCirculante)}
- PATRIMÔNIO LÍQUIDO: ${brl(balanco.patrimonioLiquido)}${plNegativo ? ' (PASSIVO A DESCOBERTO — capital próprio insuficiente para cobrir obrigações)' : ''}

INDICADORES:
- Liquidez Corrente: ${liquidezCorrente.toFixed(2)} → ${liquidezCorrente < 0.5 ? 'CRÍTICA' : liquidezCorrente < 1.0 ? 'MUITO BAIXA' : liquidezCorrente < 1.5 ? 'ATENÇÃO' : 'OK'}
- Liquidez Seca: ${liquidezSeca.toFixed(2)}
- Liquidez Geral: ${liquidezGeral.toFixed(2)}
- Endividamento Geral: ${pct(endividamentoGeral)}
- Concentração CP: ${pct(concentracaoCP)}
- PL/Ativo: ${pct(plSobreAtivo)}
- ROA: ${pct(roa)}
- ROE: ${plNegativo ? 'N/A (PL negativo)' : pct(roe)}
- Margem EBITDA: ${pct(ebitdaMargin)}
- Giro do Ativo: ${giroAtivo.toFixed(2)}x

Gere o JSON completo agora seguindo EXATAMENTE o schema.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        // For nonStreaming we want a complete response we can parse defensively
        stream: !nonStreaming,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao seu workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errorText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errorText);
      return new Response(JSON.stringify({ error: "Erro ao conectar com o serviço de IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Streaming mode (legacy clients) ────────────────────────
    if (!nonStreaming) {
      return new Response(aiResp.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ── Non-streaming mode: parse JSON defensively ─────────────
    const aiJson = await aiResp.json();
    const rawContent: string = aiJson?.choices?.[0]?.message?.content ?? "";

    console.log("[generate-presentation] Raw AI response length:", rawContent.length);
    console.log("[generate-presentation] First 500 chars:", rawContent.substring(0, 500));

    const cleaned = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // Extract first {...} block in case the model wrapped it
    const match = cleaned.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : cleaned;

    let presentation: any;
    try {
      presentation = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("[generate-presentation] Falha ao parsear JSON da IA:", parseError);
      console.error("[generate-presentation] Conteúdo retornado (primeiros 2000 chars):", rawContent.substring(0, 2000));
      return new Response(
        JSON.stringify({ error: "Falha ao processar resposta da IA", raw: rawContent.substring(0, 1000) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Validações de qualidade (apenas log, não bloqueia) ────
    if (!presentation?.analiseRentabilidade?.paragrafo1 || presentation.analiseRentabilidade.paragrafo1.length < 20) {
      console.error("[generate-presentation] analiseRentabilidade.paragrafo1 vazio ou curto demais");
    }
    if (!presentation?.analisePatrimonial?.paragrafo1 || presentation.analisePatrimonial.paragrafo1.length < 20) {
      console.error("[generate-presentation] analisePatrimonial.paragrafo1 vazio ou curto demais");
    }
    if (!Array.isArray(presentation?.pontosFortes) || presentation.pontosFortes.length === 0) {
      console.error("[generate-presentation] pontosFortes está vazio — IA não seguiu instruções");
    }
    if (Array.isArray(presentation?.recomendacoes)) {
      for (const rec of presentation.recomendacoes) {
        if (!rec?.descricao || rec.descricao === rec.titulo) {
          console.error("[generate-presentation] recomendacoes.descricao igual ao título — IA repetiu o título");
          break;
        }
      }
    } else {
      console.error("[generate-presentation] recomendacoes ausente ou inválido");
    }

    return new Response(JSON.stringify(presentation), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-presentation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
