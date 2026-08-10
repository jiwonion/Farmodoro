// Runs once a minute, invoked by the pg_cron job set up in migration 063
// (not by any end user), and sends every scheduled_push_notifications row
// whose fire_at has arrived. Auth is a shared secret in the Authorization
// header (set as CRON_DISPATCH_SECRET) instead of a user JWT, since there's
// no user session behind a cron tick.
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

const CRON_DISPATCH_SECRET = Deno.env.get("CRON_DISPATCH_SECRET") ?? "";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!CRON_DISPATCH_SECRET || authHeader !== `Bearer ${CRON_DISPATCH_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createServiceRoleClient();

  const { data: due, error } = await admin
    .from("scheduled_push_notifications")
    .select("id, user_id, title, body")
    .is("sent_at", null)
    .lte("fire_at", new Date().toISOString())
    .limit(500);

  if (error) {
    console.error("Farmodoro dispatch-scheduled-push query failed", error);
    return new Response(JSON.stringify({ error: "Query failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let dispatched = 0;
  for (const notification of due ?? []) {
    await sendPushToUser(admin, notification.user_id, {
      title: notification.title,
      body: notification.body,
    });
    dispatched += 1;
  }

  if (due?.length) {
    await admin
      .from("scheduled_push_notifications")
      .update({ sent_at: new Date().toISOString() })
      .in("id", due.map((notification) => notification.id));
  }

  return new Response(JSON.stringify({ dispatched }), {
    headers: { "Content-Type": "application/json" },
  });
});
