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
4. Retorne um JSON array com objetos {index, grupo, motivo, natureza_conta, is_redutora}
5. O campo "motivo" deve ser BREVE (1 frase)
6. O campo "natureza_conta" deve ser "sintetica" para contas que são TOTAIS ou GRUPOS, e "analitica" para contas específicas/detalhadas.
7. **CONTAS REDUTORAS**: Contas de Depreciação Acumulada, Amortização Acumulada, Exaustão Acumulada, Provisão para Devedores Duvidosos (PDD), e outras contas retificadoras que aparecem DENTRO do Ativo devem ser mantidas no grupo de ATIVO (IMOBILIZADO, INTANGIVEL, ou ATIVO_NAO_CIRCULANTE conforme aplicável). Marque "is_redutora": true para estas contas. Elas têm saldo credor mas pertencem ao Ativo — NUNCA as mova para o Passivo.
8. Exemplos de contas redutoras: "(-) Depreciação Acumulada", "Depreciação Acum. Veículos", "Amortização Acumulada", "PDD", "Provisão p/ Perdas".

Responda APENAS com o JSON array, sem markdown.`
        : `Você é um contador brasileiro sênior especialista em análise de Demonstrações do Resultado do Exercício (DRE).

Sua única tarefa é classificar cada conta contábil de uma DRE em um dos grupos válidos abaixo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## REGRA ABSOLUTA Nº 1 — FLAG isCMV (dentro_do_bloco_CMV)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O parser já detectou estruturalmente se a conta está entre a Receita Líquida e o Lucro Bruto.
- Se dentro_do_bloco_CMV = true → classifique como CMV, SEMPRE, independente do nome.
- Se dentro_do_bloco_CMV = false → NUNCA classifique como CMV apenas pelo nome da conta.
  Contas como Salários, FGTS, Férias, 13º Salário, Pró-labore, Vale Refeição, Vale Transporte,
  Gratificações, Aviso Prévio, Material de Expediente, Serviços de Terceiros, Donativos, etc.
  são SEMPRE DESPESAS_OPERACIONAIS quando dentro_do_bloco_CMV = false.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## REGRA ABSOLUTA Nº 2 — CONTAS TRABALHISTAS SÃO DESPESAS_OPERACIONAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
As seguintes contas são SEMPRE DESPESAS_OPERACIONAIS, sem exceção (a menos que dentro_do_bloco_CMV=true):
Salários, Ordenados, Pró-labore, 13º Salário, Férias, FGTS, INSS patronal,
Aviso Prévio, Rescisões, Gratificações, Adicional de Tempo de Serviço,
Vale Refeição, Vale Alimentação, Vale Transporte, Plano de Saúde,
Comissões, Bonificações, Horas Extras, Encargos Sociais, Provisão de Férias,
Provisão de 13º Salário, Folha de Pagamento.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## REGRA ABSOLUTA Nº 3 — CONTAS DE RESULTADO COMEÇAM COM "RESULTADO"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Qualquer conta cujo nome começa com a palavra "Resultado" (ex: "Resultado Operacional Líquido",
"Resultado Antes do IR", "Resultado do Exercício") é CONTAS_RESULTADO, NUNCA IR ou CSLL.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## GRUPOS VÁLIDOS PARA DRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**RECEITA_BRUTA**
Receita operacional bruta, vendas de mercadorias, prestação de serviços, faturamento bruto.
Exemplos: "Prestação de Serviços à Vista", "Vendas de Mercadorias", "Faturamento".
Sinal: positivo.

**DEDUCOES**
Impostos e deduções incidentes sobre a receita bruta: Simples Nacional, ISS, ICMS, PIS, COFINS,
devoluções de vendas, abatimentos, descontos incondicionais sobre vendas.
Exemplos: "(-) Simples Nacional s/ Vendas", "(-) ICMS s/ Vendas", "Devoluções de Vendas".
Sinal: negativo. Aparecem logo após a Receita Bruta, antes da Receita Líquida.

**RECEITA_LIQUIDA**
Linha de subtotal explícita: "Receita Líquida", "Receita Operacional Líquida".
Sinal: positivo.

**CMV**
Custo da Mercadoria Vendida, Custo dos Produtos Vendidos, Custo dos Serviços Prestados.
APENAS classifique como CMV se dentro_do_bloco_CMV = true OU se o nome contém
explicitamente "CMV", "CPV", "Custo da Mercadoria", "Custo dos Produtos", "Custo dos Serviços".
Exemplos CMV verdadeiros: "CMV", "CPV", "Custo das Mercadorias Vendidas", "Custo de Produção".
Sinal: negativo.

**LUCRO_BRUTO**
Linha de subtotal explícita: "Lucro Bruto", "Resultado Bruto".
Sinal: positivo.

**DESPESAS_OPERACIONAIS**
Todas as despesas do negócio que NÃO são CMV, financeiras ou tributárias de resultado.
Inclui OBRIGATORIAMENTE: todas as despesas trabalhistas (salários, FGTS, férias, 13º, pró-labore,
vale refeição, vale transporte, aviso prévio, rescisões, gratificações, encargos), despesas
administrativas (aluguel, energia, água, telefone, material de escritório, material de expediente),
honorários, serviços de terceiros, depreciação, amortização, despesas com TI, seguros, consultorias,
marketing, publicidade, donativos e contribuições, associações de classe.
Sinal: negativo.

**LUCRO_OPERACIONAL**
Linha de subtotal explícita: "Lucro Operacional", "Resultado Operacional", "Resultado Operacional Líquido".
Sinal: positivo ou negativo.

**RESULTADO_FINANCEIRO**
Receitas e despesas de natureza estritamente financeira: juros recebidos, juros pagos,
descontos obtidos, descontos concedidos, variação cambial, rendimentos de aplicações financeiras,
despesas bancárias, IOF, tarifas bancárias, multas de mora financeiras, CPMF.
Inclui também: impostos e taxas municipais (ISS retido, taxas de alvará), multas tributárias.
Exemplos: "Juros de Mora", "Descontos Concedidos", "Rendimento de Aplicação", "Despesas de Cobrança",
"Impostos e Taxas Municipais", "Multas de Mora".
Sinal: pode ser positivo (receitas) ou negativo (despesas).

**NAO_OPERACIONAL**
Receitas e despesas fora da atividade principal: alienação de ativos, ganho/perda na venda
de imobilizado, receitas não recorrentes não relacionadas à operação.
Exemplos: "Ganho na Alienação de Bens", "Resultado Não Operacional".

**CONTRIBUICAO_SOCIAL**
Exclusivamente CSLL — Contribuição Social sobre o Lucro Líquido.
ATENÇÃO: só use este grupo se o nome da conta for exatamente "CSLL" ou "Contribuição Social
sobre o Lucro". Contas que começam com "Resultado" → use CONTAS_RESULTADO.

**IR**
Exclusivamente IRPJ — Imposto de Renda Pessoa Jurídica.
ATENÇÃO: só use este grupo se o nome for "IRPJ", "Imposto de Renda PJ" ou similar.
Contas que começam com "Resultado" → use CONTAS_RESULTADO.

**PROVISOES**
Contas de provisão que não se enquadram nas categorias acima:
"Provisão para Contingências", "Provisão para Processos Judiciais".
NÃO use para Provisão de Férias ou Provisão de 13º → essas são DESPESAS_OPERACIONAIS.

**CONTAS_RESULTADO**
Subtotais intermediários cujo nome começa com "Resultado":
"Resultado Antes do IR", "Resultado Antes da CSLL", "Resultado Operacional Líquido",
"Resultado Antes das Deduções", "Resultado do Exercício" (quando é subtotal).

**LUCRO_LIQUIDO**
A linha final do exercício: "Lucro Líquido do Exercício", "Prejuízo do Exercício",
"Lucro do Período", "Resultado Líquido do Exercício".
É SEMPRE a última linha da DRE.

**OUTROS**
Use apenas para contas que genuinamente não se encaixam em nenhum grupo acima.
Evite ao máximo — menos de 2% das contas devem cair aqui.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## FLUXO LÓGICO DA DRE (sequência esperada)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. RECEITA_BRUTA (topo — valores positivos)
2. DEDUCOES (negativos, logo após a receita bruta)
3. RECEITA_LIQUIDA (subtotal)
4. CMV (apenas se dentro_do_bloco_CMV=true)
5. LUCRO_BRUTO (subtotal)
6. DESPESAS_OPERACIONAIS (bloco maior — trabalhistas + gerais + admin)
7. LUCRO_OPERACIONAL (subtotal)
8. RESULTADO_FINANCEIRO (receitas e despesas financeiras)
9. NAO_OPERACIONAL (se houver)
10. CONTAS_RESULTADO (subtotais intermediários "Resultado Antes de...")
11. IR / CONTRIBUICAO_SOCIAL (se regime tributário exigir)
12. LUCRO_LIQUIDO (última linha)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## FORMATO DE RESPOSTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Retorne APENAS um JSON array com objetos {index, grupo, motivo}.
O campo "motivo" deve ter no máximo 10 palavras.
Sem markdown, sem explicações fora do JSON.`;

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
    const ATIVO_GRUPOS = new Set([
      "DISPONIBILIDADES", "CAIXA", "BANCO", "APLICACOES", "CONTAS_A_RECEBER",
      "CLIENTES", "ESTOQUE", "ATIVO_CIRCULANTE", "IMOBILIZADO", "INTANGIVEL",
      "INVESTIMENTO", "REALIZAVEL", "ATIVO_NAO_CIRCULANTE",
    ]);
    const PASSIVO_GRUPOS = new Set([
      "FORNECEDOR", "OBRIGACOES", "PASSIVO_CIRCULANTE", "EMPRESTIMO_CP",
      "SALARIOS_A_PAGAR", "IMPOSTOS_A_PAGAR", "PASSIVO_NAO_CIRCULANTE",
      "EMPRESTIMO_LP", "FINANCIAMENTO_LP",
    ]);
    const PL_GRUPOS = new Set([
      "PATRIMONIO", "CAPITAL_SOCIAL", "RESERVA", "LUCROS_ACUMULADOS",
    ]);

    // Helper: determine if a grupo contradicts the section anchor
    function getDefaultGrupoForSection(contextoPai: string): string | null {
      const ctx = contextoPai.toUpperCase();
      if (ctx.includes("ATIVO") && ctx.includes("NAO CIRCULANTE")) return "ATIVO_NAO_CIRCULANTE";
      if (ctx.includes("ATIVO") && ctx.includes("CIRCULANTE")) return "ATIVO_CIRCULANTE";
      if (ctx.includes("ATIVO")) return "ATIVO_CIRCULANTE";
      if (ctx.includes("PASSIVO") && ctx.includes("NAO CIRCULANTE")) return "PASSIVO_NAO_CIRCULANTE";
      if (ctx.includes("PASSIVO") && ctx.includes("CIRCULANTE")) return "PASSIVO_CIRCULANTE";
      if (ctx.includes("PASSIVO")) return "PASSIVO_CIRCULANTE";
      if (ctx.includes("PATRIMONIO")) return "PATRIMONIO";
      return null;
    }

    function isGrupoInSection(grupo: string, contextoPai: string): boolean {
      const ctx = contextoPai.toUpperCase();
      if (ctx.includes("ATIVO")) return ATIVO_GRUPOS.has(grupo);
      if (ctx.includes("PASSIVO")) return PASSIVO_GRUPOS.has(grupo);
      if (ctx.includes("PATRIMONIO")) return PL_GRUPOS.has(grupo);
      return true; // No context — trust AI
    }

    const classifications: ClassificationResult[] = normalizedEntries.map((e) => {
      const ai = aiResults.get(e.originalIndex);
      const cached = cacheMap.get(e.descricao_normalized);
      const result = ai || cached || { grupo: "OUTROS", motivo: "Sem classificação" };

      // POST-AI OVERRIDE: If contexto_pai exists and AI grupo contradicts section, override
      if (contexto_tipo === "balancete" && e.contexto_pai) {
        const grupoOk = isGrupoInSection(result.grupo, e.contexto_pai);
        if (!grupoOk && result.grupo !== "RECEITA" && result.grupo !== "CUSTO" && result.grupo !== "DESPESA" && result.grupo !== "OUTROS") {
          const defaultGrupo = getDefaultGrupoForSection(e.contexto_pai);
          if (defaultGrupo) {
            console.log(`[OVERRIDE] "${e.descricao}" AI=${result.grupo} → ${defaultGrupo} (contexto_pai=${e.contexto_pai})`);
            return {
              descricao: e.descricao,
              grupo: defaultGrupo,
              motivo: `Corrigido por localização: conta está no bloco ${e.contexto_pai}, prevalece sobre nome.`,
            };
          }
        }
      }

      return {
        descricao: e.descricao,
        grupo: result.grupo,
        motivo: result.motivo,
      };
    });

    // Regra: "Material de Consumo" respeita a flag dentro_do_bloco_CMV
    if (contexto_tipo === "dre") {
      for (let i = 0; i < normalizedEntries.length; i++) {
        const entry = normalizedEntries[i];
        if (!isMaterialConsumo(entry.descricao_normalized)) continue;

        if (entry.isCMV) {
          classifications[i] = {
            descricao: classifications[i].descricao,
            grupo: "CMV",
            motivo: "Material de Consumo dentro do bloco CMV.",
          };
        } else {
          classifications[i] = {
            descricao: classifications[i].descricao,
            grupo: "DESPESAS_OPERACIONAIS",
            motivo: "Material de Consumo fora do bloco CMV = despesa operacional.",
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
