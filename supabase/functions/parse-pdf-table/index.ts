import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { rawText, fileType } = (await req.json()) as {
      rawText: string;
      fileType: "DRE" | "BALANCETE" | "BALANCO_PATRIMONIAL";
    };

    if (!rawText || rawText.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Texto extraído insuficiente para processar." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Truncate very long texts to avoid token limits (keep first ~80k chars)
    const truncatedText = rawText.length > 80000 ? rawText.substring(0, 80000) + "\n[... texto truncado ...]" : rawText;

    let systemPrompt = "";
    let outputSchema = "";

    if (fileType === "DRE") {
      outputSchema = `[{\\"descricao\\": \\"string\\", \\"valor\\": number, \\"valor_anterior\\": number|null}]`;
      systemPrompt = `Você é um contador brasileiro especialista em extração de dados de Demonstrações do Resultado do Exercício (DRE).\n\nSua tarefa: Receber texto bruto (potencialmente desestruturado) extraído de um PDF e reconstruir a tabela da DRE.\n\n## Regras:\n1. Identifique as colunas: Descrição da conta, Valor do Período Atual, Valor do Período Anterior (se houver)\n2. Mantenha a ordem original das contas\n3. Valores negativos devem ser representados como números negativos\n4. Ignore cabeçalhos, rodapés, números de página e textos decorativos\n5. Se uma conta continua de uma página para outra (texto quebrado), junte-a numa única entrada\n6. Valores em formato brasileiro (1.234,56) devem ser convertidos para formato numérico (1234.56)\n7. Contas sem valor numérico devem ser ignoradas (são títulos de seção)\n8. Se houver indicadores D/C (Débito/Crédito), interprete: receitas como positivas, despesas/custos como negativos\n\n## Formato de saída:\nRetorne APENAS um JSON array: ${outputSchema}\nSem markdown, sem explicações.`;
    } else if (fileType === "BALANCETE") {
      outputSchema = `[{\\"conta\\": \\"string\\", \\"saldo_anterior\\": number, \\"debitos\\": number, \\"creditos\\": number, \\"saldo_atual\\": number, \\"natureza\\": \\"D\\\"|\\\"C\\\"}]`;
      systemPrompt = `Você é um contador brasileiro especialista em extração de dados de Balancetes Contábeis.\n\nSua tarefa: Receber texto bruto (potencialmente desestruturado) extraído de um PDF e reconstruir a tabela do Balancete.\n\n## Regras:\n1. Identifique as colunas: Conta (descrição), Saldo Anterior, Débitos, Créditos, Saldo Atual\n2. A natureza (D=Devedora ou C=Credora) pode estar numa coluna separada ou como sufixo do valor\n3. Mantenha a ordem original das contas\n4. Ignore cabeçalhos repetidos em todas as páginas, rodapés e números de página\n5. Se uma conta continua de uma página para outra, junte-a\n6. Valores em formato brasileiro (1.234,56) devem ser convertidos para numérico (1234.56)\n7. Contas totalizadoras (ex: \\"TOTAL DO ATIVO\\") devem ser incluídas\n8. Se não conseguir determinar a natureza, use \\"D\\" como padrão\n\n## Formato de saída:\nRetorne APENAS um JSON array: ${outputSchema}\nSem markdown, sem explicações.`;
    } else if (fileType === "BALANCO_PATRIMONIAL") {
      outputSchema = `[{\\"conta\\": \\"string\\", \\"tipo\\": \\"ATIVO_CIRCULANTE\\\"|\\\"ATIVO_NAO_CIRCULANTE\\\"|\\\"PASSIVO_CIRCULANTE\\\"|\\\"PASSIVO_NAO_CIRCULANTE\\\"|\\\"PATRIMONIO_LIQUIDO\\\", \\"valor\\": number, \\"valor_anterior\\": number|null, \\"hierarchy\\": \\"string\\"}]`;
      systemPrompt = `Você é um contador brasileiro especialista em extração de dados de Balanço Patrimonial.\n\nSua tarefa: Receber texto bruto (potencialmente desestruturado) extraído de um PDF e reconstruir a tabela do Balanço Patrimonial.\n\n## Regras:\n1. Identifique as seções: ATIVO (Circulante, Não Circulante), PASSIVO (Circulante, Não Circulante), PATRIMÔNIO LÍQUIDO\n2. Cada conta deve ter: descrição, tipo (seção), valor atual, valor anterior (se houver)\n3. O campo \\"hierarchy\\" indica o nível de indentação (ex: \\"1\\" para grupo, \\"1.1\\" para subgrupo, \\"1.1.1\\" para conta)\n4. Valores em formato brasileiro (1.234,56) devem ser convertidos para numérico (1234.56)\n5. Ignore cabeçalhos e rodapés repetidos em todas as páginas\n6. Se uma conta continua entre páginas, junte-a\n7. Mantenha a ordem original\n\n## Formato de saída:\nRetorne APENAS um JSON array: ${outputSchema}\nSem markdown, sem explicações.`;
    }

    const userPrompt = `Extraia e estruture os dados contabilísticos deste texto bruto de PDF:\n\n---INÍCIO DO TEXTO---\n${truncatedText}\n---FIM DO TEXTO---`;

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
          temperature: 0.05,
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
    let content = aiResponse.choices?.[0]?.message?.content || "[]";

    // Clean markdown wrapping
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
    }

    let entries: any[];
    try {
      entries = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "A IA não conseguiu estruturar os dados. Tente exportar em Excel." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum dado contabilístico identificado no PDF." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ entries, count: entries.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("parse-pdf-table error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erro desconhecido ao processar PDF",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
