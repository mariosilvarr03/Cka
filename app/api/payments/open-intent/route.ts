import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type PaymentMethod = "mbway" | "multibanco";

type OpenIntentRow = {
  id: string;
  status: "created" | "pending";
  expires_at: string | null;
  paid_at: string | null;
  last_error: string | null;
  method: PaymentMethod;
  amount: number;
  external_entity: string | null;
  external_reference: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chargeId = String(searchParams.get("chargeId") ?? "").trim();

  if (!chargeId) {
    return NextResponse.json({ error: "chargeId em falta" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { data: charge } = await supabase
    .from("charges")
    .select("id")
    .eq("id", chargeId)
    .eq("athlete_user_id", user.id)
    .maybeSingle<{ id: string }>();

  if (!charge) {
    return NextResponse.json({ error: "Cobranca nao encontrada" }, { status: 404 });
  }

  const { data: openIntent } = await supabase
    .from("payment_intents")
    .select("id, status, expires_at, paid_at, last_error, method, amount, external_entity, external_reference, metadata, created_at")
    .eq("charge_id", charge.id)
    .eq("athlete_user_id", user.id)
    .in("status", ["created", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<OpenIntentRow>();

  if (!openIntent) {
    return NextResponse.json({ intent: null });
  }

  const now = Date.now();
  const expiresAtMs = openIntent.expires_at ? new Date(openIntent.expires_at).getTime() : null;
  const effectiveStatus =
    openIntent.status === "pending" && expiresAtMs !== null && expiresAtMs < now
      ? "expired"
      : openIntent.status;

  const metadata = openIntent.metadata ?? {};

  if (openIntent.method === "mbway") {
    return NextResponse.json({
      intent: {
        id: openIntent.id,
        status: effectiveStatus,
        expires_at: openIntent.expires_at,
        paid_at: openIntent.paid_at,
        last_error: openIntent.last_error,
      },
      method: "mbway",
      instructions: {
        phone: getString(metadata["mbwayPhone"]),
        message: "Pedido MB Way enviado. Confirma o pagamento na app do teu banco.",
      },
    });
  }

  return NextResponse.json({
    intent: {
      id: openIntent.id,
      status: effectiveStatus,
      expires_at: openIntent.expires_at,
      paid_at: openIntent.paid_at,
      last_error: openIntent.last_error,
    },
    method: "multibanco",
    instructions: {
      entity: openIntent.external_entity ?? "",
      reference: openIntent.external_reference ?? "",
      amount: Number(openIntent.amount),
      message: "Usa a entidade e referencia para concluir o pagamento no Multibanco/Homebanking.",
    },
  });
}
