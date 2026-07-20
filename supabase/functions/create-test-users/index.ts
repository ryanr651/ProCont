import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const users = [
    { email: "teste.basico@klarcont.com", senha: "KlarCont@Basico2025", plano: "basico" },
    { email: "teste.intermediario@klarcont.com", senha: "KlarCont@Inter2025", plano: "intermediario" },
    { email: "teste.premium@klarcont.com", senha: "KlarCont@Premium2025", plano: "premium" },
  ];

  const resultados: any[] = [];
  for (const u of users) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.senha,
      email_confirm: true,
      user_metadata: { display_name: `Teste ${u.plano}` },
    });
    if (!error && data.user) {
      await supabase
        .from("profiles")
        .update({ plano: u.plano, subscription_status: "active" })
        .eq("user_id", data.user.id);
    }
    resultados.push({ email: u.email, plano: u.plano, error: error?.message ?? null });
  }

  return new Response(JSON.stringify(resultados), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
