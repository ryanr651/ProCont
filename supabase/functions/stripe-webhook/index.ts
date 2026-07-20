import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2025-08-27.basil",
  });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("No signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (e) {
    return new Response(`Webhook error: ${(e as Error).message}`, { status: 400 });
  }

  const PRICE_TO_PLAN: Record<string, string> = {
    [Deno.env.get("STRIPE_PRICE_BASICO") ?? ""]: "basico",
    [Deno.env.get("STRIPE_PRICE_INTERMEDIARIO") ?? ""]: "intermediario",
    [Deno.env.get("STRIPE_PRICE_PREMIUM") ?? ""]: "premium",
  };

  async function findUserIdByEmail(email: string | null | undefined): Promise<string | null> {
    if (!email) return null;
    // Look up user via auth admin listing (paginated); for typical small user bases this is fine.
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    return found?.id ?? null;
  }

  try {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0].price.id;
      const plano = PRICE_TO_PLAN[priceId] ?? "basico";
      const customerId = sub.customer as string;
      const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
      const userId = await findUserIdByEmail(customer.email);
      if (userId) {
        await supabase
          .from("profiles")
          .update({
            plano,
            subscription_status: sub.status === "active" ? "active" : "inactive",
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            subscription_end: new Date(sub.current_period_end * 1000).toISOString(),
          })
          .eq("user_id", userId);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
      const userId = await findUserIdByEmail(customer.email);
      if (userId) {
        await supabase
          .from("profiles")
          .update({ plano: "sem_plano", subscription_status: "inactive" })
          .eq("user_id", userId);
      }
    }
  } catch (e) {
    console.error("[stripe-webhook]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
