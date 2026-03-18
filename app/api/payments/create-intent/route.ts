import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentIntent, type SupportedPaymentMethod } from "@/lib/payments/provider";

type CreateIntentBody = {
  chargeId?: string;
  method?: SupportedPaymentMethod;
  mbwayPhone?: string;
  receiptEmail?: string;
  nif?: string;
};

type ChargeRow = {
  id: string;
  athlete_user_id: string;
  amount: number;
  status: "pending" | "paid" | "cancelled" | "expired";
  currency: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateIntentBody;
    const chargeId = String(body.chargeId ?? "").trim();
    const method = body.method;

    if (!chargeId || (method !== "mbway" && method !== "multibanco")) {
      return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
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
      .select("id, athlete_user_id, amount, status, currency")
      .eq("id", chargeId)
      .eq("athlete_user_id", user.id)
      .maybeSingle<ChargeRow>();

    if (!charge) {
      return NextResponse.json({ error: "Cobranca nao encontrada" }, { status: 404 });
    }

    if (charge.status === "paid" || charge.status === "cancelled") {
      return NextResponse.json({ error: "Cobranca sem pagamento disponivel" }, { status: 409 });
    }

    if (Number(charge.amount) <= 0) {
      return NextResponse.json({ error: "Cobranca invalida para pagamento" }, { status: 409 });
    }

    const { count: existingPaymentCount } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("charge_id", charge.id);

    if ((existingPaymentCount ?? 0) > 0) {
      return NextResponse.json({ error: "Cobranca ja paga" }, { status: 409 });
    }

    const providerIntent = await createPaymentIntent({
      chargeId: charge.id,
      amount: Number(charge.amount),
      currency: charge.currency,
      method,
      mbwayPhone: body.mbwayPhone,
      receiptEmail: body.receiptEmail,
      nif: body.nif,
    });

    const adminClient = createAdminClient();
    const { data: insertedIntent, error: insertError } = await adminClient
      .from("payment_intents")
      .insert({
        charge_id: charge.id,
        athlete_user_id: user.id,
        provider: providerIntent.provider,
        method: providerIntent.method,
        amount: charge.amount,
        currency: charge.currency,
        status: "pending",
        external_request_id: providerIntent.externalRequestId,
        external_reference: providerIntent.externalReference ?? null,
        external_entity: providerIntent.externalEntity ?? null,
        expires_at: providerIntent.expiresAt,
        metadata: {
          mbwayPhone: body.mbwayPhone ?? null,
          receiptEmail: body.receiptEmail ?? null,
          nif: body.nif ?? null,
        },
      })
      .select("id, status, expires_at, external_request_id, external_reference, external_entity")
      .single();

    if (insertError || !insertedIntent) {
      return NextResponse.json({ error: "Falha ao criar intencao de pagamento" }, { status: 500 });
    }

    return NextResponse.json({
      intent: insertedIntent,
      provider: providerIntent.provider,
      method: providerIntent.method,
      instructions: providerIntent.instructions,
    });
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
