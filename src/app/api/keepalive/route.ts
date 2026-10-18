import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Called once a day by Vercel Cron (see vercel.json) so the free Supabase
 * project sees activity and isn't paused. Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { url, key } = supabaseEnv();
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  // An anonymous caller is refused by the database (permission denied), but the
  // request still reaches Postgres, which is all that's needed to count as activity.
  const { status } = await supabase.from("categories").select("id", { head: true });
  const reachedDatabase = status === 200 || status === 401 || status === 403;
  return Response.json({ ok: reachedDatabase, status, at: new Date().toISOString() });
}
