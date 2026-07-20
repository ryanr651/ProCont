import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-08-27.basil",
    });

    const basic = await stripe.products.create({
      name: "KlarCont Básico",
      description: "Até 5 empresas. Inclui DRE, Balanço, Balancete e análises com IA.",
      metadata: { plan: "basico", max_empresas: "5" },
    });
    const basicPrice = await stripe.prices.create({
      product: basic.id,
      unit_amount: 25000,
      currency: "brl",
      recurring: { interval: "month" },
      metadata: { plan: "basico" },
    });

    const inter = await stripe.products.create({
      name: "KlarCont Intermediário",
      description: "Até 10 empresas. Inclui faturamento e simulador.",
      metadata: { plan: "intermediario", max_empresas: "10" },
    });
    const interPrice = await stripe.prices.create({
      product: inter.id,
      unit_amount: 40000,
      currency: "brl",
      recurring: { interval: "month" },
      metadata: { plan: "intermediario" },
    });

    const premium = await stripe.products.create({
      name: "KlarCont Premium",
      description: "Até 20 empresas. Acesso completo a todos os recursos.",
      metadata: { plan: "premium", max_empresas: "20" },
    });
    const premiumPrice = await stripe.prices.create({
      product: premium.id,
      unit_amount: 55000,
      currency: "brl",
      recurring: { interval: "month" },
      metadata: { plan: "premium" },
    });

    return new Response(
      JSON.stringify({
        basico: { productId: basic.id, priceId: basicPrice.id },
        intermediario: { productId: inter.id, priceId: interPrice.id },
        premium: { productId: premium.id, priceId: premiumPrice.id },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
