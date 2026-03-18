import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type IntentStatusRow = {
  id: string;
  status: "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";
  expires_at: string | null;
  paid_at: string | null;
  last_error: string | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const intentId = String(searchParams.get("intentId") ?? "").trim();

  if (!intentId) {
    return NextResponse.json({ error: "intentId em falta" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { data: intent } = await supabase
    .from("payment_intents")
    .select("id, status, expires_at, paid_at, last_error")
    .eq("id", intentId)
    .eq("athlete_user_id", user.id)
    .maybeSingle<IntentStatusRow>();

  if (!intent) {
    return NextResponse.json({ error: "Intencao nao encontrada" }, { status: 404 });
  }

  const now = Date.now();
  const expiresAtMs = intent.expires_at ? new Date(intent.expires_at).getTime() : null;
  const effectiveStatus =
    intent.status === "pending" && expiresAtMs !== null && expiresAtMs < now
      ? "expired"
      : intent.status;

  return NextResponse.json({
    intent: {
      id: intent.id,
      status: effectiveStatus,
      expires_at: intent.expires_at,
      paid_at: intent.paid_at,
      last_error: intent.last_error,
    },
  });
}
