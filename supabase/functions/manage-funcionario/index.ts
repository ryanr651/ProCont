import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller is a master
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
    } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is master
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "master")
      .single();

    if (!callerRole) {
      return new Response(
        JSON.stringify({ error: "Only master users can manage funcionarios" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { email, password, display_name } = body;
      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "Email and password required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Create auth user
      const { data: newUser, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: display_name || email },
        });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update profile to link to master and set as funcionario
      await adminClient
        .from("profiles")
        .update({ master_id: caller.id, display_name: display_name || email })
        .eq("user_id", newUser.user!.id);

      // Update role to funcionario (replace auto-created master role)
      await adminClient
        .from("user_roles")
        .update({ role: "funcionario" })
        .eq("user_id", newUser.user!.id);

      return new Response(
        JSON.stringify({
          success: true,
          user_id: newUser.user!.id,
          email: newUser.user!.email,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "toggle_status") {
      const { user_id, status } = body;
      if (!user_id || !status) {
        return new Response(
          JSON.stringify({ error: "user_id and status required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Verify user belongs to this master
      const { data: profile } = await adminClient
        .from("profiles")
        .select("master_id")
        .eq("user_id", user_id)
        .single();

      if (!profile || profile.master_id !== caller.id) {
        return new Response(
          JSON.stringify({ error: "User not found or not your funcionario" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      await adminClient
        .from("profiles")
        .update({ status })
        .eq("user_id", user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "user_id required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Verify user belongs to this master
      const { data: profile } = await adminClient
        .from("profiles")
        .select("master_id")
        .eq("user_id", user_id)
        .single();

      if (!profile || profile.master_id !== caller.id) {
        return new Response(
          JSON.stringify({ error: "User not found or not your funcionario" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Delete related data first
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("user_id", user_id);

      // Delete auth user
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data: funcionarios } = await adminClient
        .from("profiles")
        .select("user_id, display_name, status, created_at")
        .eq("master_id", caller.id);

      // Get emails from auth
      const enriched = [];
      for (const f of funcionarios || []) {
        const { data: authUser } =
          await adminClient.auth.admin.getUserById(f.user_id);
        enriched.push({
          ...f,
          email: authUser?.user?.email || "N/A",
        });
      }

      return new Response(JSON.stringify({ funcionarios: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
