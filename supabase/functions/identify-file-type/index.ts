import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_TYPES = [
  "DRE",
  "BALANCO_PATRIMONIAL",
  "DMPL",
  "FLUXO_CAIXA",
  "BALANCETE",
  "DRA",
  "FATURAMENTO",
  "DESCONHECIDO",
];

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { files } = (await req.json()) as {
      files: Array<{ filename: string; headers: string[] }>;
    };

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um contador brasileiro especialista em demonstrações financeiras.

Sua tarefa: identificar o TIPO de demonstração contábil a partir do nome do arquivo e das primeiras linhas de conteúdo.

## Tipos válidos:
- DRE: Demonstração do Resultado do Exercício (contém receita, custos, despesas, lucro)
- BALANCO_PATRIMONIAL: Balanço Patrimonial (contém ativo, passivo, patrimônio líquido)
- DMPL: Demonstração das Mutações do Patrimônio Líquido
- FLUXO_CAIXA: Demonstração de Fluxo de Caixa (DFC) (contém atividades operacionais, investimento, financiamento)
- BALANCETE: Balancete de verificação (lista de contas com saldos devedores e credores)
- DRA: Demonstração do Resultado Abrangente
- FATURAMENTO: Relatório de Faturamento (contém meses, saídas, serviços, totais mensais)
- DESCONHECIDO: Não foi possível identificar

## Regras:
1. Analise o nome do arquivo E o conteúdo das primeiras linhas
2. Se o nome contiver "faturamento" ou as linhas contiverem "RELATÓRIO DE FATURAMENTO" ou colunas "Saídas R$", "Serviços R$", "Total R$" → FATURAMENTO
3. Se o nome contiver "dre" ou "demonstracao resultado" → provavelmente DRE
4. Se o nome contiver "balanco" ou "balanço" → provavelmente BALANCO_PATRIMONIAL
5. Se as linhas contiverem "ativo", "passivo", "patrimônio líquido" → BALANCO_PATRIMONIAL
6. Se as linhas contiverem "receita", "custo", "lucro bruto", "despesas" → DRE
7. Se contiver "mutações" ou "DMPL" → DMPL
8. Se contiver "fluxo de caixa" ou "atividades operacionais" → FLUXO_CAIXA

Responda APENAS com um JSON array no formato: [{"index": 0, "tipo": "DRE", "confianca": "alta"}]
Sem markdown, sem explicações.`;

    const userPrompt = `Identifique o tipo de cada arquivo contábil:

${JSON.stringify(
  files.map((f, i) => ({
    index: i,
    filename: f.filename,
    primeiras_linhas: f.headers.slice(0, 15).join("\n"),
  })),
  null,
  2
)}`;

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
          JSON.stringify({ error: "Rate limit excedido, tente novamente." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    let content = aiResponse.choices?.[0]?.message?.content || "[]";
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
    }

    let parsed: Array<{ index: number; tipo: string; confianca: string }>;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      parsed = [];
    }

    // Validate and normalize
    const results = files.map((f, i) => {
      const match = parsed.find((p) => p.index === i);
      const tipo = match && VALID_TYPES.includes(match.tipo) ? match.tipo : "DESCONHECIDO";
      return {
        filename: f.filename,
        tipo,
        confianca: match?.confianca || "baixa",
      };
    });

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("identify-file-type error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
