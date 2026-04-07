import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/payments/provider";

type WebhookPayload = {
  provider?: string;
  external_event_id?: string;
  event_type?: string;
  data?: Record<string, unknown>;
  id?: string;
  key?: string;
  type?: string;
  status?: string;
  date?: string;
};

type IntentRow = {
  id: string;
  charge_id: string;
  amount: number;
  method: "online_card" | "mbway" | "multibanco" | "cash" | "bank_transfer" | "other";
  status: "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";
};

type MappedStatus = "pending" | "paid" | "failed" | "expired" | "cancelled";

function getString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

function getNestedString(data: Record<string, unknown>, path: string) {
  const keys = path.split(".");
  let current: unknown = data;

  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return "";
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current.trim() : "";
}

function getNumber(data: Record<string, unknown>, key: string) {
  const value = data[key];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function mapWebhookStatus(eventType: string, data: Record<string, unknown>): MappedStatus | null {
  const normalizedEvent = eventType.toLowerCase();
  const explicitStatus = getString(data, "status").toLowerCase();

  if (normalizedEvent.includes("paid") || explicitStatus === "paid") {
    return "paid";
  }
  if (normalizedEvent.includes("expired") || explicitStatus === "expired") {
    return "expired";
  }
  if (normalizedEvent.includes("cancel") || explicitStatus === "cancelled") {
    return "cancelled";
  }
  if (normalizedEvent.includes("fail") || explicitStatus === "failed") {
    return "failed";
  }
  if (normalizedEvent.includes("pending") || explicitStatus === "pending" || explicitStatus === "created") {
    return "pending";
  }

  return null;
}

function mapEasypayStatus(status: string, eventType: string): MappedStatus | null {
  const normalizedStatus = status.toLowerCase();
  const normalizedEvent = eventType.toLowerCase();

  if (normalizedStatus === "paid") {
    return "paid";
  }
  if (normalizedStatus === "success") {
    if (
      normalizedEvent.includes("capture") ||
      normalizedEvent.includes("transaction") ||
      normalizedEvent.includes("sale") ||
      normalizedEvent.includes("paid")
    ) {
      return "paid";
    }
    return "pending";
  }
  if (["pending", "created", "authorised", "authorized", "enrolled"].includes(normalizedStatus)) {
    return "pending";
  }
  if (["failed", "error", "declined"].includes(normalizedStatus)) {
    return "failed";
  }
  if (normalizedStatus === "expired") {
    return "expired";
  }
  if (["cancelled", "canceled", "deleted", "voided"].includes(normalizedStatus)) {
    return "cancelled";
  }

  return null;
}

function isLikelyEasypayPayload(payload: WebhookPayload) {
  return Boolean(payload.id && payload.status && payload.type);
}

function getEasypayConfig() {
  const accountId = process.env.PAYMENTS_PROVIDER_ACCOUNT_ID;
  const apiKey = process.env.PAYMENTS_PROVIDER_API_KEY;
  const baseUrl = (process.env.PAYMENTS_PROVIDER_BASE_URL ?? "https://api.test.easypay.pt/2.0").replace(/\/+$/, "");

  if (!accountId || !apiKey) {
    return null;
  }

  return {
    accountId,
    apiKey,
    baseUrl,
  };
}

async function fetchEasypaySingle(paymentId: string) {
  const config = getEasypayConfig();
  if (!config) {
    throw new Error("Credenciais Easypay nao configuradas");
  }

  const response = await fetch(`${config.baseUrl}/single/${paymentId}`, {
    method: "GET",
    headers: {
      AccountId: config.accountId,
      ApiKey: config.apiKey,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Falha ao verificar webhook na Easypay (${response.status})`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return data;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.PAYMENTS_WEBHOOK_SECRET;
  const receivedSecret = request.headers.get("x-webhook-secret");
  const signatureHeader = request.headers.get("x-webhook-signature");

  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    return NextResponse.json({ error: "Assinatura de webhook invalida" }, { status: 401 });
  }

  if (webhookSecret && (!receivedSecret || receivedSecret !== webhookSecret)) {
    return NextResponse.json({ error: "Webhook nao autorizado" }, { status: 401 });
  }

  let payload: WebhookPayload;

  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Payload JSON invalido" }, { status: 400 });
  }

  const easypayPayload = isLikelyEasypayPayload(payload);

  const providerFromPayload = String(payload.provider ?? "").trim().toLowerCase();
  const provider = easypayPayload && (!providerFromPayload || providerFromPayload === "generic")
    ? "easypay"
    : providerFromPayload;
  const eventType = String(payload.event_type ?? payload.type ?? "").trim();

  let externalEventId = String(payload.external_event_id ?? "").trim();
  if (!externalEventId && easypayPayload) {
    externalEventId = [payload.id, payload.key, payload.type, payload.status, payload.date].filter(Boolean).join(":");
  }

  if (!provider || !externalEventId) {
    return NextResponse.json({ error: "Evento de webhook invalido" }, { status: 400 });
  }

  const eventData: Record<string, unknown> = {
    ...(payload.data ?? {}),
  };

  if (easypayPayload) {
    eventData.payment_id = String(payload.id ?? "").trim();
    eventData.status = String(payload.status ?? "").trim();
    eventData.type = String(payload.type ?? "").trim();
    eventData.provider_ref = String(payload.key ?? "").trim();
    eventData.key = String(payload.key ?? "").trim();
    eventData.date = String(payload.date ?? "").trim();
  }

  let mappedStatus = mapWebhookStatus(eventType, eventData);

  if (provider === "easypay") {
    const paymentIdFromEvent =
      getString(eventData, "payment_id") ||
      getString(eventData, "external_request_id") ||
      getString(eventData, "request_id") ||
      "";

    if (!paymentIdFromEvent) {
      return NextResponse.json({ error: "Webhook Easypay sem payment id" }, { status: 400 });
    }

    try {
      const verification = await fetchEasypaySingle(paymentIdFromEvent);
      const verificationStatus =
        getString(verification, "status") ||
        getString(verification, "payment_status") ||
        getNestedString(verification, "method.status");
      const verificationType = getString(verification, "type") || getNestedString(verification, "method.type") || eventType;
      const verificationKey = getString(verification, "key");
      const verificationDate = getString(verification, "date") || getString(verification, "created_at");
      const verificationAmount = getNumber(verification, "value");
      const verificationEntity = getString(verification, "entity") || getNestedString(verification, "method.entity");
      const verificationReference = getString(verification, "reference") || getNestedString(verification, "method.reference");

      eventData.external_request_id = paymentIdFromEvent;
      eventData.status = verificationStatus || getString(eventData, "status");
      eventData.type = verificationType || getString(eventData, "type");

      if (verificationKey) {
        eventData.provider_ref = verificationKey;
        eventData.key = verificationKey;
      }
      if (verificationDate) {
        eventData.paid_at = verificationDate;
      }
      if (Number.isFinite(verificationAmount)) {
        eventData.amount = verificationAmount;
      }
      if (verificationEntity) {
        eventData.external_entity = verificationEntity;
      }
      if (verificationReference) {
        eventData.external_reference = verificationReference;
      }

      if (!eventData.provider_ref) {
        eventData.provider_ref = getString(eventData, "provider_ref") || payload.key || null;
      }

      mappedStatus = mapEasypayStatus(String(eventData.status ?? ""), String(eventData.type ?? eventType));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "falha ao verificar webhook";
      return NextResponse.json({ error: detail }, { status: 502 });
    }
  }

  const adminClient = createAdminClient();

  const { data: webhookEvent, error: insertError } = await adminClient
    .from("payment_webhook_events")
    .insert({
      provider,
      external_event_id: externalEventId,
      event_type: eventType || null,
      payload,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }

    return NextResponse.json(
      { error: "Falha ao registar webhook recebido" },
      { status: 500 },
    );
  }

  const webhookEventId = webhookEvent?.id;

  const externalRequestId =
    getString(eventData, "payment_id") ||
    getString(eventData, "external_request_id") ||
    getString(eventData, "request_id") ||
    getString(eventData, "provider_request_id");
  const intentId = getString(eventData, "intent_id");
  const keyFromPayload = getString(eventData, "key");
  const chargeIdFromKey = keyFromPayload.startsWith("charge:") ? keyFromPayload.slice(7).trim() : "";
  const chargeIdFromPayload = getString(eventData, "charge_id") || chargeIdFromKey;

  let intent: IntentRow | null = null;

  if (intentId) {
    const { data } = await adminClient
      .from("payment_intents")
      .select("id, charge_id, amount, method, status")
      .eq("id", intentId)
      .maybeSingle<IntentRow>();
    intent = data ?? null;
  }

  if (!intent && externalRequestId) {
    const { data } = await adminClient
      .from("payment_intents")
      .select("id, charge_id, amount, method, status")
      .eq("provider", provider)
      .eq("external_request_id", externalRequestId)
      .maybeSingle<IntentRow>();
    intent = data ?? null;
  }

  if (!intent && chargeIdFromPayload) {
    const { data } = await adminClient
      .from("payment_intents")
      .select("id, charge_id, amount, method, status")
      .eq("provider", provider)
      .eq("charge_id", chargeIdFromPayload)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<IntentRow>();
    intent = data ?? null;
  }

  if (!intent && chargeIdFromPayload) {
    const { data } = await adminClient
      .from("payment_intents")
      .select("id, charge_id, amount, method, status")
      .eq("charge_id", chargeIdFromPayload)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<IntentRow>();
    intent = data ?? null;
  }

  if (!intent) {
    if (webhookEventId) {
      await adminClient
        .from("payment_webhook_events")
        .update({ processed_at: new Date().toISOString(), processing_error: "payment_intent nao encontrada" })
        .eq("id", webhookEventId);
    }

    return NextResponse.json({ received: true, skipped: "intent_not_found" }, { status: 202 });
  }

  if (!mappedStatus) {
    if (webhookEventId) {
      await adminClient
        .from("payment_webhook_events")
        .update({ processed_at: new Date().toISOString(), processing_error: "estado de webhook nao reconhecido" })
        .eq("id", webhookEventId);
    }

    return NextResponse.json({ received: true, skipped: "unknown_status" }, { status: 202 });
  }

  if (mappedStatus === "paid") {
    const providerRef =
      getString(eventData, "provider_ref") ||
      getString(eventData, "reference") ||
      getString(eventData, "external_reference") ||
      externalEventId;

    const amountFromWebhook = getNumber(eventData, "amount");
    const amountToConfirm = Number.isFinite(amountFromWebhook) && amountFromWebhook > 0
      ? amountFromWebhook
      : Number(intent.amount);

    const paidAtRaw = getString(eventData, "paid_at");
    const paidAt = paidAtRaw || new Date().toISOString();

    const { error: rpcError } = await adminClient.rpc("confirm_external_payment", {
      p_charge_id: intent.charge_id,
      p_amount: amountToConfirm,
      p_method: intent.method,
      p_provider: provider,
      p_provider_ref: providerRef,
      p_paid_at: paidAt,
      p_notes: `Webhook ${externalEventId}`,
      p_payment_intent_id: intent.id,
    });

    if (rpcError) {
      if (webhookEventId) {
        await adminClient
          .from("payment_webhook_events")
          .update({ processed_at: new Date().toISOString(), processing_error: "falha confirm_external_payment" })
          .eq("id", webhookEventId);
      }

      return NextResponse.json({ error: "Falha ao confirmar pagamento externo" }, { status: 500 });
    }
  } else {
    const providerRef =
      getString(eventData, "provider_ref") ||
      getString(eventData, "reference") ||
      getString(eventData, "external_reference") ||
      null;
    const errorDetail = getString(eventData, "error") || null;

    await adminClient
      .from("payment_intents")
      .update({
        status: mappedStatus,
        external_reference: providerRef,
        last_error: errorDetail,
      })
      .eq("id", intent.id);
  }

  if (webhookEventId) {
    await adminClient
      .from("payment_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: null })
      .eq("id", webhookEventId);
  }

  return NextResponse.json({ received: true });
}
