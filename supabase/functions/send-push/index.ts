// Sends an immediate push notification for something that just happened:
// a gift mail arriving, or a comment landing on the caller's bulletin post.
// Invoked directly by the client right after the action's own RPC succeeds
// (supabaseClient.functions.invoke), authenticated with the caller's JWT.
//
// Notification text is composed here from server-verified data, not taken
// from the request body -- otherwise any authenticated user could use this
// endpoint as a free-text push channel to any other user.
//
// Self-contained (no relative imports) so it can be pasted as one file into
// the Supabase Dashboard's Edge Function editor without a project-wide
// _shared/ folder needing to exist alongside it.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function createServiceRoleClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
}

// Sends one push message to every device the target user has subscribed
// from. A 404/410 response means the browser's push service has dropped
// that subscription (uninstalled, permission revoked, etc.) -- clean those
// rows up here instead of letting them accumulate and get retried forever.
async function sendPushToUser(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  payload: { title: string; body: string },
): Promise<{ sent: number; failed: number }> {
  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !subscriptions?.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (pushError) {
        failed += 1;
        const statusCode = (pushError as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(subscription.id);
        } else {
          console.error("Farmodoro push send failed", statusCode, pushError);
        }
      }
    }),
  );

  if (staleIds.length) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }

  return { sent, failed };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await anonClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const admin = createServiceRoleClient();

    if (body.event === "farm_mail") {
      const { data: mail } = await admin
        .from("farm_mail")
        .select("sender_user_id, sender_name, recipient_user_id")
        .eq("id", body.mailId)
        .maybeSingle();
      if (!mail || mail.sender_user_id !== callerId) {
        return new Response(JSON.stringify({ error: "Mail not found" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await sendPushToUser(admin, mail.recipient_user_id, {
        title: "새 농장 우편이 도착했어",
        body: `${mail.sender_name || "농장 친구"}님이 우편을 보냈어`,
      });
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.event === "bulletin_comment") {
      const { data: comment } = await admin
        .from("farm_bulletin_comments")
        .select("user_id, message, post_id, parent_comment_id")
        .eq("id", body.commentId)
        .maybeSingle();
      if (!comment || comment.user_id !== callerId) {
        return new Response(JSON.stringify({ error: "Comment not found" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // A reply notifies the comment it replies to, not the post author --
      // top-level comments keep notifying the post author as before.
      let targetUserId: string | null = null;
      let title = "대자보에 댓글이 달렸어";
      if (comment.parent_comment_id) {
        const { data: parentComment } = await admin
          .from("farm_bulletin_comments")
          .select("user_id")
          .eq("id", comment.parent_comment_id)
          .maybeSingle();
        targetUserId = parentComment?.user_id ?? null;
        title = "내 댓글에 답글이 달렸어";
      } else {
        const { data: post } = await admin
          .from("farm_bulletin_posts")
          .select("user_id")
          .eq("id", comment.post_id)
          .maybeSingle();
        targetUserId = post?.user_id ?? null;
      }

      if (!targetUserId || targetUserId === callerId) {
        return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await sendPushToUser(admin, targetUserId, {
        title,
        body: comment.message,
      });
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unsupported event" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Farmodoro send-push failed", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
