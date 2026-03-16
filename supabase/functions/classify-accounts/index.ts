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
  posicao_relativa?: number;
  isCMV?: boolean; // flag from parser: account is inside CMV block
  contexto_pai?: string; // section anchor detected by position (e.g. "ATIVO CIRCULANTE", "PASSIVO CIRCULANTE")
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

const VALID_GRUPOS_BALANCETE = [
  "DISPONIBILIDADES",
  "CAIXA",
  "BANCO",
  "APLICACOES",
  "CONTAS_A_RECEBER",
  "CLIENTES",
  "ESTOQUE",
  "ATIVO_CIRCULANTE",
  "IMOBILIZADO",
  "INTANGIVEL",
  "INVESTIMENTO",
  "REALIZAVEL",
  "ATIVO_NAO_CIRCULANTE",
  "FORNECEDOR",
  "OBRIGACOES",
  "PASSIVO_CIRCULANTE",
  "EMPRESTIMO_CP",
  "SALARIOS_A_PAGAR",
  "IMPOSTOS_A_PAGAR",
  "PASSIVO_NAO_CIRCULANTE",
  "EMPRESTIMO_LP",
  "FINANCIAMENTO_LP",
  "PATRIMONIO",
  "CAPITAL_SOCIAL",
  "RESERVA",
  "LUCROS_ACUMULADOS",
  "RECEITA",
  "CUSTO",
  "DESPESA",
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string };

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

    const normalizedEntries = entries.map((e, index) => ({
      ...e,
      originalIndex: index,
      descricao_normalized: normalize(e.descricao),
      isCMV: e.isCMV || false,
      contexto_pai: e.contexto_pai || "",
    }));

    const isMaterialConsumo = (descricaoNormalized: string) =>
      descricaoNormalized.includes("MATERIAL DE CONSUMO");

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

    const descFrequency = new Map<string, number>();
    for (const entry of normalizedEntries) {
      descFrequency.set(
        entry.descricao_normalized,
        (descFrequency.get(entry.descricao_normalized) || 0) + 1
      );
    }

    // Step 2: Identify uncached entries
    const uncachedEntries = normalizedEntries.filter(
      (e) => !cacheMap.has(e.descricao_normalized) || e.isCMV
    );

    // Step 3: Call AI for uncached entries (if any)
    const aiResults = new Map<number, { grupo: string; motivo: string }>();

    if (uncachedEntries.length > 0) {
      // Build context with position info for AI
      const accountList = uncachedEntries.map((e, i) => ({
        index: i,
        descricao: e.descricao,
        valor: e.valor,
        valor_anterior: e.valor_anterior,
        sinal: e.valor >= 0 ? "positivo" : "negativo",
        dentro_do_bloco_CMV: e.isCMV || false,
        contexto_pai: e.contexto_pai || "",
      }));

      const validGrupos = contexto_tipo === "balancete" ? VALID_GRUPOS_BALANCETE : VALID_GRUPOS_DRE;

      const systemPrompt = contexto_tipo === "balancete"
        ? `Você é um contador brasileiro especialista em classificação de contas de Balancete Contábil.
Você é um classificador HIERÁRQUICO. Cada conta vem acompanhada de um campo "contexto_pai" que indica o BLOCO DE SEÇÃO onde a conta está posicionada no arquivo original (ex: "ATIVO CIRCULANTE", "PASSIVO CIRCULANTE", "PATRIMONIO LIQUIDO").

## REGRA MAIS IMPORTANTE — LOCALIZAÇÃO PREVALECE:
A classificação DEVE respeitar o "contexto_pai". Se uma conta chamada "Empréstimos" tem contexto_pai "ATIVO CIRCULANTE", ela é um ATIVO (empréstimos concedidos a receber), NÃO um passivo.
Se "Impostos" tem contexto_pai "ATIVO CIRCULANTE", são "Impostos a Recuperar" (ativo). Se contexto_pai for "PASSIVO CIRCULANTE", são "Impostos a Recolher" (passivo).

## Grupos válidos para BALANCETE:
- DISPONIBILIDADES: Caixa geral, fundo fixo, caixa pequena
- CAIXA: Contas de caixa 
- BANCO: Contas bancárias, banco conta movimento, aplicações bancárias de curto prazo
- APLICACOES: Aplicações financeiras
- CONTAS_A_RECEBER: Duplicatas a receber, clientes, títulos a receber
- CLIENTES: Contas de clientes específicos
- ESTOQUE: Estoques, mercadorias, produtos, matéria-prima
- ATIVO_CIRCULANTE: Outros ativos circulantes não classificados acima
- IMOBILIZADO: Imóveis, veículos, máquinas, equipamentos, móveis e utensílios
- INTANGIVEL: Marcas, patentes, software, goodwill
- INVESTIMENTO: Participações societárias, investimentos de longo prazo
- REALIZAVEL: Realizável a longo prazo, depósitos judiciais
- ATIVO_NAO_CIRCULANTE: Outros ativos não circulantes
- FORNECEDOR: Fornecedores, contas a pagar por compras
- OBRIGACOES: Obrigações diversas, contas a pagar gerais
- PASSIVO_CIRCULANTE: Outros passivos de curto prazo
- EMPRESTIMO_CP: Empréstimos e financiamentos de curto prazo
- SALARIOS_A_PAGAR: Salários, férias, FGTS, INSS a pagar
- IMPOSTOS_A_PAGAR: ICMS, ISS, PIS, COFINS, IRPJ, CSLL a recolher
- PASSIVO_NAO_CIRCULANTE: Outros passivos de longo prazo
- EMPRESTIMO_LP: Empréstimos de longo prazo
- FINANCIAMENTO_LP: Financiamentos de longo prazo
- PATRIMONIO: Patrimônio líquido geral
- CAPITAL_SOCIAL: Capital social subscrito/integralizado
- RESERVA: Reservas de lucros, reservas de capital
- LUCROS_ACUMULADOS: Lucros ou prejuízos acumulados
- RECEITA: Receitas operacionais e não operacionais
- CUSTO: Custos de mercadoria, produção, serviços
- DESPESA: Despesas operacionais, administrativas, financeiras
- OUTROS: Contas que não se encaixam acima

## Regras CRÍTICAS:
1. **REGRA SUPREMA**: Use o campo "contexto_pai" para determinar se a conta é ATIVO, PASSIVO ou PL. Se contexto_pai contém "ATIVO", a conta DEVE ser classificada em um grupo de ATIVO. Se contém "PASSIVO", DEVE ser um grupo de PASSIVO. NUNCA classifique uma conta de ATIVO como PASSIVO ou vice-versa.
2. Nomes ambíguos como "Impostos", "Empréstimos", "Adiantamentos" existem tanto no Ativo quanto no Passivo. Use SEMPRE o contexto_pai para desambiguar.
3. Contas de ATIVO são tipicamente devedoras, PASSIVO/PL credoras
4. Retorne um JSON array com objetos {index, grupo, motivo, natureza_conta}
5. O campo "motivo" deve ser BREVE (1 frase)
6. O campo "natureza_conta" deve ser "sintetica" para contas que são TOTAIS ou GRUPOS (ex: "Ativo", "Circulante", "Disponibilidades", "Imobilizado" quando seguido de subcontas), e "analitica" para contas específicas/detalhadas (ex: "Banco do Brasil", "Caixa Matriz", "ICMS a Recuperar").

Responda APENAS com o JSON array, sem markdown.`
        : `Você é um contador brasileiro especialista em classificação de contas contábeis.

Sua tarefa: classificar cada conta contábil em um dos grupos abaixo.

## Grupos válidos para DRE:
- RECEITA_BRUTA: Receita operacional bruta, vendas, faturamento, prestação de serviços
- DEDUCOES: Impostos sobre vendas, devoluções, abatimentos, simples nacional, deduções da receita bruta
- RECEITA_LIQUIDA: Linha explícita de receita líquida (subtotal)
- CMV: Custo da mercadoria vendida, CPV, custo dos produtos vendidos, custo dos serviços prestados, custo de produção. SOMENTE classifique como CMV se: (a) o nome contém explicitamente "Custo", "CMV", "CPV", ou (b) o campo "dentro_do_bloco_CMV" for true. Contas ambíguas como "Material de Consumo", "Material de Embalagem", "Fretes" NÃO devem ser classificadas como CMV apenas pelo nome — use SEMPRE a flag "dentro_do_bloco_CMV" para decidir. Se "dentro_do_bloco_CMV" for false, classifique como DESPESAS_OPERACIONAIS.
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
1. **REGRA MAIS IMPORTANTE**: Se o campo "dentro_do_bloco_CMV" for true, a conta DEVE ser classificada como CMV, independentemente do nome. Contas como "Material de Consumo", "Frete sobre Vendas", "Embalagens", etc., podem aparecer tanto como CMV quanto como Despesa Operacional dependendo de onde estão posicionadas na DRE. Se "dentro_do_bloco_CMV" for true, significa que o parser detectou que a conta está entre a Receita Líquida e o Lucro Bruto, portanto faz parte do CMV. Se "dentro_do_bloco_CMV" for false, classifique normalmente pelo nome e contexto (provavelmente DESPESAS_OPERACIONAIS).
2. Se a conta COMEÇA com "Resultado" (ex: "Resultado antes da contribuição social"), classifique como CONTAS_RESULTADO, NÃO como CONTRIBUICAO_SOCIAL ou IR
3. Considere o SINAL do valor: receitas são positivas, despesas/custos são negativos
4. Considere a POSIÇÃO da conta na demonstração: contas no topo são receita, no meio são custos/despesas, no final são impostos/resultado
5. Subtotais (Receita Líquida, Lucro Bruto, etc.) devem ser classificados em seu grupo específico
6. Retorne um JSON array com objetos {index, grupo, motivo}
7. O campo "motivo" deve ser uma explicação BREVE (1 frase) de por que aquela classificação foi escolhida

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
          const grupo = validGrupos.includes(item.grupo) ? item.grupo : "OUTROS";
          aiResults.set(entry.originalIndex, {
            grupo,
            motivo: item.motivo || "Classificado pela IA",
          });
        }
      }

      // Handle entries that AI didn't return (fallback)
      for (const entry of uncachedEntries) {
        if (!aiResults.has(entry.originalIndex)) {
          aiResults.set(entry.originalIndex, {
            grupo: "OUTROS",
            motivo: "Classificação não retornada pela IA (fallback)",
          });
        }
      }

      // Step 4: Save AI results to cache (skip ambiguous/repeated descriptions)
      const cacheInserts = uncachedEntries
        .filter((entry) => {
          const count = descFrequency.get(entry.descricao_normalized) || 0;
          return count === 1 && !isMaterialConsumo(entry.descricao_normalized);
        })
        .map((entry) => {
          const result = aiResults.get(entry.originalIndex) || {
            grupo: "OUTROS",
            motivo: "Classificação não retornada pela IA (fallback)",
          };

          return {
            user_id: user.id,
            descricao_normalized: entry.descricao_normalized,
            grupo: result.grupo,
            motivo: result.motivo,
            contexto_tipo,
          };
        });

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
      const ai = aiResults.get(e.originalIndex);
      const cached = cacheMap.get(e.descricao_normalized);
      const result = ai || cached || { grupo: "OUTROS", motivo: "Sem classificação" };

      return {
        descricao: e.descricao,
        grupo: result.grupo,
        motivo: result.motivo,
      };
    });

    // Regra específica solicitada: "Material de Consumo"
    // 1ª ocorrência => CMV | 2ª+ ocorrência => DESPESAS_OPERACIONAIS
    if (contexto_tipo === "dre") {
      let materialConsumoCount = 0;

      for (let i = 0; i < normalizedEntries.length; i++) {
        const entry = normalizedEntries[i];
        if (!isMaterialConsumo(entry.descricao_normalized)) continue;

        materialConsumoCount += 1;

        if (materialConsumoCount === 1) {
          classifications[i] = {
            descricao: classifications[i].descricao,
            grupo: "CMV",
            motivo: "1ª ocorrência de Material de Consumo classificada como CMV por regra de negócio.",
          };
        } else {
          classifications[i] = {
            descricao: classifications[i].descricao,
            grupo: "DESPESAS_OPERACIONAIS",
            motivo: "2ª+ ocorrência de Material de Consumo classificada como Despesa Operacional por regra de negócio.",
          };
        }
      }
    }

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
