import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SIGNING_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signToken(payload: Record<string, unknown>): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(SIGNING_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

async function verifyToken(token: string): Promise<Record<string, any> | null> {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const key = await hmacKey(SIGNING_SECRET);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sig),
      enc.encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(b64urlDecode(body)));
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iter = 100000;
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    baseKey,
    256,
  );
  return `pbkdf2$${iter}$${b64urlEncode(salt)}$${b64urlEncode(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iter = parseInt(iterStr, 10);
    const salt = b64urlDecode(saltB64);
    const expected = b64urlDecode(hashB64);
    const baseKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
        baseKey,
        expected.length * 8,
      ),
    );
    if (bits.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = String(body.action || "");

  // ---- Public actions ----
  if (action === "hash_password") {
    const password = String(body.password || "");
    if (!password || password.length < 4) return json({ error: "Senha muito curta" }, 400);
    return json({ hash: await hashPassword(password) });
  }

  if (action === "info") {
    const empresa_id = String(body.empresa_id || "");
    if (!empresa_id) return json({ error: "empresa_id obrigatório" }, 400);
    const { data: empresa } = await supabase
      .from("empresas")
      .select("id, nome")
      .eq("id", empresa_id)
      .maybeSingle();
    if (!empresa) return json({ error: "Empresa não encontrada" }, 404);
    const { data: link } = await supabase
      .from("client_links")
      .select("id, is_active")
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    return json({
      empresa: { id: empresa.id, nome: empresa.nome },
      active: !!(link && link.is_active),
    });
  }

  if (action === "login") {
    const empresa_id = String(body.empresa_id || "");
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!empresa_id || !username || !password) {
      return json({ success: false, error: "Dados incompletos" }, 400);
    }
    const { data: link } = await supabase
      .from("client_links")
      .select("id, is_active")
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    if (!link || !link.is_active) {
      return json({ success: false, error: "Link inativo ou inexistente" }, 401);
    }
    const { data: linkUser } = await supabase
      .from("client_link_users")
      .select("id, username, password_hash")
      .eq("link_id", link.id)
      .eq("username", username)
      .maybeSingle();
    if (!linkUser) return json({ success: false, error: "Credenciais inválidas" }, 401);
    const ok = await verifyPassword(password, linkUser.password_hash);
    if (!ok) return json({ success: false, error: "Credenciais inválidas" }, 401);
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const token = await signToken({ empresa_id, username, exp });
    return json({ success: true, token, expires_at: exp });
  }

  if (action === "data") {
    const empresa_id = String(body.empresa_id || "");
    const token = String(body.token || "");
    const payload = await verifyToken(token);
    if (!payload || payload.empresa_id !== empresa_id) {
      return json({ error: "Não autorizado" }, 401);
    }
    const { data: link } = await supabase
      .from("client_links")
      .select("id, is_active")
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    if (!link || !link.is_active) return json({ error: "Link inativo" }, 401);

    const [empresaRes, dreRes, balancoRes, balanceteRes, faturamentoRes] = await Promise.all([
      supabase.from("empresas").select("id, nome, cnpj, cnae, regime_tributario").eq("id", empresa_id).maybeSingle(),
      supabase.from("dre_entries").select("*").eq("empresa_id", empresa_id),
      supabase.from("balanco_entries").select("*").eq("empresa_id", empresa_id),
      supabase.from("balancete_entries").select("*").eq("empresa_id", empresa_id),
      supabase.from("faturamento_entries").select("*").eq("empresa_id", empresa_id),
    ]);

    return json({
      empresa: empresaRes.data,
      dre: dreRes.data || [],
      balanco: balancoRes.data || [],
      balancete: balanceteRes.data || [],
      faturamento: faturamentoRes.data || [],
    });
  }

  return json({ error: "Ação desconhecida" }, 400);
});