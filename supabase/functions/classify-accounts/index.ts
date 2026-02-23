import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AccountEntry {
  descricao: string;
  valor: number;
  valor_anterior?: number | null;
  posicao_relativa?: number; // position in the file (for context)
}

interface ClassificationResult {
  descricao: string;
  grupo: string;
  motivo: string;
}

const VALID_GRUPOS_DRE = [
  "RECEITA_BRUTA",
  "DEDUCOES",
  "RECEITA_LIQUIDA",
  "CMV",
  "LUCRO_BRUTO",
  "DESPESAS_OPERACIONAIS",
  "LUCRO_OPERACIONAL",
  "RESULTADO_FINANCEIRO",
  "NAO_OPERACIONAL",
  "CONTRIBUICAO_SOCIAL",
  "IR",
  "PROVISOES",
  "CONTAS_RESULTADO",
  "LUCRO_LIQUIDO",
  "OUTROS",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user from auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { entries, contexto_tipo = "dre" } = (await req.json()) as {
      entries: AccountEntry[];
      contexto_tipo?: string;
    };

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ classifications: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize descriptions
    const normalize = (text: string) =>
      text
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const normalizedEntries = entries.map((e) => ({
      ...e,
      descricao_normalized: normalize(e.descricao),
    }));

    // Step 1: Check cache for existing classifications
    const normalizedDescs = [...new Set(normalizedEntries.map((e) => e.descricao_normalized))];

    const { data: cachedRows } = await supabase
      .from("classification_cache")
      .select("descricao_normalized, grupo, motivo")
      .eq("user_id", user.id)
      .eq("contexto_tipo", contexto_tipo)
      .in("descricao_normalized", normalizedDescs);

    const cacheMap = new Map<string, { grupo: string; motivo: string }>();
    if (cachedRows) {
      for (const row of cachedRows) {
        cacheMap.set(row.descricao_normalized, {
          grupo: row.grupo,
          motivo: row.motivo,
        });
      }
    }

    // Step 2: Identify uncached entries
    const uncachedEntries = normalizedEntries.filter(
      (e) => !cacheMap.has(e.descricao_normalized)
    );

    // Step 3: Call AI for uncached entries (if any)
    const aiResults = new Map<string, { grupo: string; motivo: string }>();

    if (uncachedEntries.length > 0) {
      // Build context with position info for AI
      const accountList = uncachedEntries.map((e, i) => ({
        index: i,
        descricao: e.descricao,
        valor: e.valor,
        valor_anterior: e.valor_anterior,
        sinal: e.valor >= 0 ? "positivo" : "negativo",
      }));

      const systemPrompt = `Você é um contador brasileiro especialista em classificação de contas contábeis.

Sua tarefa: classificar cada conta contábil em um dos grupos abaixo.

## Grupos válidos para DRE:
- RECEITA_BRUTA: Receita operacional bruta, vendas, faturamento, prestação de serviços
- DEDUCOES: Impostos sobre vendas, devoluções, abatimentos, simples nacional, deduções da receita bruta
- RECEITA_LIQUIDA: Linha explícita de receita líquida (subtotal)
- CMV: Custo da mercadoria vendida, CPV, custo dos produtos, custo dos serviços, estoque, compras
- LUCRO_BRUTO: Linha explícita de lucro bruto ou resultado bruto (subtotal)
- DESPESAS_OPERACIONAIS: Despesas administrativas, trabalhistas, salários, aluguel, honorários, depreciação, despesas gerais
- LUCRO_OPERACIONAL: Linha explícita de lucro operacional ou resultado operacional (subtotal)
- RESULTADO_FINANCEIRO: Receitas e despesas financeiras, juros, variação cambial, resultado financeiro
- NAO_OPERACIONAL: Receitas e despesas não operacionais, alienação de ativos
- CONTRIBUICAO_SOCIAL: CSLL, contribuição social sobre lucro líquido (NÃO confundir com contas que começam com "Resultado")
- IR: IRPJ, imposto de renda pessoa jurídica (NÃO confundir com contas que começam com "Resultado")
- PROVISOES: Provisões (contas que começam com "Provisão")
- CONTAS_RESULTADO: Contas que começam com "Resultado" e são subtotais intermediários (ex: Resultado antes da contribuição social, Resultado antes do IR)
- LUCRO_LIQUIDO: Lucro líquido do exercício, resultado do exercício, lucro do período (resultado final)
- OUTROS: Contas que não se encaixam em nenhum grupo acima

## Regras CRÍTICAS:
1. Se a conta COMEÇA com "Resultado" (ex: "Resultado antes da contribuição social"), classifique como CONTAS_RESULTADO, NÃO como CONTRIBUICAO_SOCIAL ou IR
2. Considere o SINAL do valor: receitas são positivas, despesas/custos são negativos
3. Considere a POSIÇÃO da conta na demonstração: contas no topo são receita, no meio são custos/despesas, no final são impostos/resultado
4. Subtotais (Receita Líquida, Lucro Bruto, etc.) devem ser classificados em seu grupo específico
5. Retorne um JSON array com objetos {index, grupo, motivo}
6. O campo "motivo" deve ser uma explicação BREVE (1 frase) de por que aquela classificação foi escolhida

Responda APENAS com o JSON array, sem markdown, sem explicações adicionais.`;

      const userPrompt = `Classifique estas contas contábeis de uma ${contexto_tipo.toUpperCase()}:

${JSON.stringify(accountList, null, 2)}`;

      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.1,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit excedido, tente novamente em alguns segundos." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const errText = await response.text();
        console.error("AI gateway error:", response.status, errText);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const aiResponse = await response.json();
      const content = aiResponse.choices?.[0]?.message?.content || "[]";

      // Parse AI response - handle potential markdown wrapping
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
      }

      let parsed: Array<{ index: number; grupo: string; motivo: string }>;
      try {
        parsed = JSON.parse(cleanContent);
      } catch {
        console.error("Failed to parse AI response:", cleanContent);
        parsed = [];
      }

      // Map AI results back to entries
      for (const item of parsed) {
        const entry = uncachedEntries[item.index];
        if (entry) {
          const grupo = VALID_GRUPOS_DRE.includes(item.grupo) ? item.grupo : "OUTROS";
          aiResults.set(entry.descricao_normalized, {
            grupo,
            motivo: item.motivo || "Classificado pela IA",
          });
        }
      }

      // Handle entries that AI didn't return (fallback)
      for (const entry of uncachedEntries) {
        if (!aiResults.has(entry.descricao_normalized)) {
          aiResults.set(entry.descricao_normalized, {
            grupo: "OUTROS",
            motivo: "Classificação não retornada pela IA (fallback)",
          });
        }
      }

      // Step 4: Save AI results to cache
      const cacheInserts = Array.from(aiResults.entries()).map(
        ([desc, result]) => ({
          user_id: user.id,
          descricao_normalized: desc,
          grupo: result.grupo,
          motivo: result.motivo,
          contexto_tipo,
        })
      );

      if (cacheInserts.length > 0) {
        const { error: cacheError } = await supabase
          .from("classification_cache")
          .upsert(cacheInserts, {
            onConflict: "user_id,descricao_normalized,contexto_tipo",
          });
        if (cacheError) {
          console.error("Cache save error:", cacheError);
        }
      }
    }

    // Step 5: Build final classifications
    const classifications: ClassificationResult[] = normalizedEntries.map((e) => {
      const cached = cacheMap.get(e.descricao_normalized);
      const ai = aiResults.get(e.descricao_normalized);
      const result = cached || ai || { grupo: "OUTROS", motivo: "Sem classificação" };

      return {
        descricao: e.descricao,
        grupo: result.grupo,
        motivo: result.motivo,
      };
    });

    return new Response(
      JSON.stringify({
        classifications,
        stats: {
          total: entries.length,
          from_cache: entries.length - uncachedEntries.length,
          from_ai: uncachedEntries.length,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("classify-accounts error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
