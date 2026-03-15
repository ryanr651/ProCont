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
  isCMV?: boolean;
}

interface ClassificationResult {
  descricao: string;
  grupo: string;
  motivo: string;
  confianca_contextual?: number;
  ambiguo?: boolean;
  id_original?: number;
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

    // For DRE: ALWAYS send all entries to AI for hierarchical context, even if cached
    // For balancete: use cache as before
    const isDRE = contexto_tipo === "dre";

    // Entries that need AI classification
    const uncachedEntries = isDRE
      ? normalizedEntries // DRE: send ALL for full context
      : normalizedEntries.filter(
          (e) => !cacheMap.has(e.descricao_normalized) || e.isCMV
        );

    // Step 3: Call AI for entries
    const aiResults = new Map<number, { grupo: string; motivo: string; confianca: number; ambiguo: boolean }>();

    if (uncachedEntries.length > 0) {
      // Build FULL SEQUENCE context for AI (hierarchical)
      // For DRE, we send the COMPLETE ordered list so AI sees the document structure
      const fullSequence = normalizedEntries.map((e, i) => ({
        id_original: i,
        descricao: e.descricao,
        valor: e.valor,
        valor_anterior: e.valor_anterior,
        sinal: e.valor >= 0 ? "positivo" : "negativo",
        dentro_do_bloco_CMV: e.isCMV || false,
        posicao_no_documento: i + 1,
        total_linhas: normalizedEntries.length,
      }));

      // Detect duplicate descriptions for AI awareness
      const duplicateDescs = new Set<string>();
      for (const [desc, count] of descFrequency.entries()) {
        if (count > 1) duplicateDescs.add(desc);
      }

      const duplicateInfo = duplicateDescs.size > 0
        ? `\n\n## ATENÇÃO - CONTAS DUPLICADAS DETECTADAS:\nAs seguintes descrições aparecem mais de uma vez no documento: ${[...duplicateDescs].map(d => `"${d}"`).join(", ")}.\nPara cada duplicata, use a POSIÇÃO no documento e o BLOCO/TOTALIZADOR ao qual pertence para decidir o grupo correto. NÃO classifique todas as ocorrências iguais no mesmo grupo.`
        : "";

      const validGrupos = isDRE ? VALID_GRUPOS_DRE : VALID_GRUPOS_BALANCETE;

      const systemPrompt = isDRE
        ? `Você é um contador brasileiro ESPECIALISTA em classificação de contas contábeis de DRE (Demonstração do Resultado do Exercício).

## SUA MISSÃO
Classifique CADA conta da DRE no grupo correto, usando CONTEXTO HIERÁRQUICO e POSIÇÃO no documento.

## MÉTODO DE ANÁLISE (obrigatório)
1. **PRIMEIRO**: Identifique a ESTRUTURA do documento. Detecte se é um relatório de sistema contábil específico (Domínio, Prosoft, Questor, Fortes, PROCONT, etc.) e aplique as regras de layout desse sistema.
2. **SEGUNDO**: Identifique os "GRANDES GRUPOS" (âncoras/totalizadores) no documento: Receita Operacional, Receita Líquida, CMV/CPV, Lucro Bruto, Despesas Operacionais, Lucro Operacional, Resultado Financeiro, Lucro Líquido.
3. **TERCEIRO**: Para CADA conta, determine a qual totalizador ela pertence baseado na sua POSIÇÃO entre as âncoras.

## PESO DAS REGRAS
- **Peso 2 (MAIS IMPORTANTE)**: Posição da linha no documento e bloco hierárquico ao qual pertence
- **Peso 1 (SECUNDÁRIO)**: Nome/descrição da conta

## GRUPOS VÁLIDOS PARA DRE:
- RECEITA_BRUTA: Receita operacional bruta, vendas, faturamento, prestação de serviços
- DEDUCOES: Impostos sobre vendas, devoluções, abatimentos, simples nacional, deduções da receita bruta
- RECEITA_LIQUIDA: Linha explícita de receita líquida (subtotal)
- CMV: Custo da mercadoria vendida, CPV, custo dos produtos/serviços. REGRA ESPECIAL: se "dentro_do_bloco_CMV" = true, OBRIGATÓRIO classificar como CMV
- LUCRO_BRUTO: Linha explícita de lucro bruto ou resultado bruto (subtotal)
- DESPESAS_OPERACIONAIS: Despesas administrativas, trabalhistas, salários, aluguel, honorários, depreciação
- LUCRO_OPERACIONAL: Linha explícita de lucro/resultado operacional (subtotal)
- RESULTADO_FINANCEIRO: Receitas e despesas financeiras, juros, variação cambial
- NAO_OPERACIONAL: Receitas e despesas não operacionais, alienação de ativos
- CONTRIBUICAO_SOCIAL: CSLL (NÃO confundir com contas que começam com "Resultado")
- IR: IRPJ, imposto de renda pessoa jurídica
- PROVISOES: Provisões (contas que começam com "Provisão")
- CONTAS_RESULTADO: Contas que começam com "Resultado" e são subtotais intermediários
- LUCRO_LIQUIDO: Lucro líquido do exercício, resultado final
- OUTROS: Contas que não se encaixam

## REGRAS CRÍTICAS DE HIERARQUIA:
1. **BLOCO CMV**: Se "dentro_do_bloco_CMV" = true, a conta DEVE ser CMV, independentemente do nome.
2. **DUPLICATAS**: Se encontrar contas com MESMO NOME (ex: "PIS", "COFINS", "Material de Consumo"):
   - Analise a qual TOTALIZADOR cada ocorrência soma
   - Contas entre Receita Bruta → Receita Líquida = DEDUCOES
   - Contas entre Receita Líquida → Lucro Bruto = CMV
   - Contas após Lucro Bruto = DESPESAS_OPERACIONAIS (ou outro grupo contextual)
3. Se a conta COMEÇA com "Resultado" → CONTAS_RESULTADO (não CSLL/IR)
4. Considere o SINAL: receitas positivas, despesas/custos negativos

## CONFIANÇA
Para CADA conta, retorne um campo "confianca" (0 a 100):
- 95-100: Certeza total (nome inequívoco OU posição clara no documento)
- 80-94: Alta confiança (posição clara mas nome ambíguo)
- 60-79: Média confiança (alguma ambiguidade)
- 0-59: Baixa confiança (conta ambígua, duplicata sem contexto claro)

Se a confiança for < 80, marque "ambiguo": true.
${duplicateInfo}

## FORMATO DE RESPOSTA
Retorne um JSON array com objetos: {index, grupo, motivo, confianca, ambiguo}
- index: posição da conta na lista enviada
- grupo: um dos grupos válidos acima
- motivo: explicação BREVE (1 frase) incluindo qual bloco hierárquico determinou a classificação
- confianca: número 0-100
- ambiguo: boolean (true se confiança < 80)

Responda APENAS com o JSON array, sem markdown, sem explicações adicionais.`
        : `Você é um contador brasileiro especialista em classificação de contas de Balancete Contábil.

Sua tarefa: classificar cada conta do balancete em um dos grupos abaixo.

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
1. Considere o NOME da conta para classificar corretamente
2. Contas de ATIVO são tipicamente devedoras, PASSIVO/PL credoras
3. Retorne um JSON array com objetos {index, grupo, motivo, confianca, ambiguo}
4. O campo "motivo" deve ser BREVE (1 frase)
5. "confianca": número 0-100 indicando certeza da classificação
6. "ambiguo": true se confiança < 80

Responda APENAS com o JSON array, sem markdown.`;

      // For DRE: send full document sequence for hierarchical context
      const accountList = isDRE ? fullSequence : uncachedEntries.map((e, i) => ({
        index: i,
        descricao: e.descricao,
        valor: e.valor,
        valor_anterior: e.valor_anterior,
        sinal: e.valor >= 0 ? "positivo" : "negativo",
        dentro_do_bloco_CMV: e.isCMV || false,
      }));

      const userPrompt = isDRE
        ? `Classifique estas contas da DRE na ORDEM EXATA em que aparecem no documento original.
A sequência completa é fundamental para entender a hierarquia:

${JSON.stringify(accountList, null, 2)}`
        : `Classifique estas contas contábeis de uma ${contexto_tipo.toUpperCase()}:

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

      let cleanContent = content.trim();
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
      }

      let parsed: Array<{ index?: number; id_original?: number; grupo: string; motivo: string; confianca?: number; ambiguo?: boolean }>;
      try {
        parsed = JSON.parse(cleanContent);
      } catch {
        console.error("Failed to parse AI response:", cleanContent);
        parsed = [];
      }

      // Map AI results back to entries
      for (const item of parsed) {
        // For DRE full-sequence mode, use id_original; for batched mode use index
        const targetIndex = isDRE ? (item.id_original ?? item.index) : undefined;
        const entry = isDRE
          ? normalizedEntries[targetIndex ?? -1]
          : uncachedEntries[item.index ?? -1];

        if (entry) {
          const grupo = validGrupos.includes(item.grupo) ? item.grupo : "OUTROS";
          const confianca = typeof item.confianca === "number" ? item.confianca : 90;
          aiResults.set(entry.originalIndex, {
            grupo,
            motivo: item.motivo || "Classificado pela IA",
            confianca,
            ambiguo: item.ambiguo === true || confianca < 80,
          });
        }
      }

      // Handle entries that AI didn't return (fallback)
      for (const entry of uncachedEntries) {
        if (!aiResults.has(entry.originalIndex)) {
          aiResults.set(entry.originalIndex, {
            grupo: "OUTROS",
            motivo: "Classificação não retornada pela IA (fallback)",
            confianca: 0,
            ambiguo: true,
          });
        }
      }

      // Step 4: Save AI results to cache (skip duplicates and ambiguous for DRE)
      const cacheInserts = (isDRE ? normalizedEntries : uncachedEntries)
        .filter((entry) => {
          const count = descFrequency.get(entry.descricao_normalized) || 0;
          if (count > 1) return false; // Don't cache duplicates
          if (isMaterialConsumo(entry.descricao_normalized)) return false;
          const result = aiResults.get(entry.originalIndex);
          if (result?.ambiguo) return false; // Don't cache ambiguous
          return true;
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

    // Step 5: Build final classifications with enriched data
    const classifications: ClassificationResult[] = normalizedEntries.map((e) => {
      const ai = aiResults.get(e.originalIndex);
      const cached = cacheMap.get(e.descricao_normalized);

      let grupo: string;
      let motivo: string;
      let confianca: number;
      let ambiguo: boolean;

      if (ai) {
        grupo = ai.grupo;
        motivo = ai.motivo;
        confianca = ai.confianca;
        ambiguo = ai.ambiguo;
      } else if (cached) {
        grupo = cached.grupo;
        motivo = cached.motivo;
        confianca = 95; // cached = previously validated
        ambiguo = false;
      } else {
        grupo = "OUTROS";
        motivo = "Sem classificação";
        confianca = 0;
        ambiguo = true;
      }

      return {
        descricao: e.descricao,
        grupo,
        motivo,
        confianca_contextual: confianca,
        ambiguo,
        id_original: e.originalIndex,
      };
    });

    // Regra específica: "Material de Consumo"
    // 1ª ocorrência => CMV | 2ª+ ocorrência => DESPESAS_OPERACIONAIS
    if (isDRE) {
      let materialConsumoCount = 0;

      for (let i = 0; i < normalizedEntries.length; i++) {
        const entry = normalizedEntries[i];
        if (!isMaterialConsumo(entry.descricao_normalized)) continue;

        materialConsumoCount += 1;

        if (materialConsumoCount === 1) {
          classifications[i] = {
            ...classifications[i],
            grupo: "CMV",
            motivo: "1ª ocorrência de Material de Consumo classificada como CMV por regra de negócio.",
            confianca_contextual: 100,
            ambiguo: false,
          };
        } else {
          classifications[i] = {
            ...classifications[i],
            grupo: "DESPESAS_OPERACIONAIS",
            motivo: "2ª+ ocorrência de Material de Consumo classificada como Despesa Operacional por regra de negócio.",
            confianca_contextual: 100,
            ambiguo: false,
          };
        }
      }
    }

    const ambiguousCount = classifications.filter(c => c.ambiguo).length;

    return new Response(
      JSON.stringify({
        classifications,
        stats: {
          total: entries.length,
          from_cache: isDRE ? 0 : entries.length - uncachedEntries.length,
          from_ai: uncachedEntries.length,
          ambiguous: ambiguousCount,
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
