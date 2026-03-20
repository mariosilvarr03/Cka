import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { createMockIntent, type SupportedPaymentMethod } from "@/lib/payments/mockProvider";

export type { SupportedPaymentMethod };

export type CreateIntentInput = {
  chargeId: string;
  amount: number;
  currency: string;
  method: SupportedPaymentMethod;
  mbwayPhone?: string;
  receiptEmail?: string;
  nif?: string;
};

export type MbwayInstructions = {
  phone: string;
  message: string;
};

export type MultibancoInstructions = {
  entity: string;
  reference: string;
  amount: number;
  message: string;
};

export type ProviderIntentResponse = {
  provider: string;
  method: SupportedPaymentMethod;
  externalRequestId: string;
  expiresAt: string;
  externalReference?: string | null;
  externalEntity?: string | null;
  instructions: MbwayInstructions | MultibancoInstructions;
};

type RealProviderApiResponse = Record<string, unknown>;

function getProviderMode() {
  return (process.env.PAYMENTS_PROVIDER_MODE ?? "mock").toLowerCase();
}

function getString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

function getRecord(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = data[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function getFromPath(data: Record<string, unknown>, path: string) {
  const keys = path.split(".");
  let current: unknown = data;

  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function pickString(data: Record<string, unknown>, paths: string[]) {
  for (const path of paths) {
    const value = getFromPath(data, path);
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return "";
}

function pickNumber(data: Record<string, unknown>, paths: string[]) {
  for (const path of paths) {
    const value = getFromPath(data, path);
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return NaN;
}

function normalizeEasypayMethod(method: SupportedPaymentMethod) {
  if (method === "mbway") {
    return "mbw";
  }
  if (method === "multibanco") {
    return "mb";
  }
  return method;
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function extractEasypayMethod(data: Record<string, unknown>, fallback: SupportedPaymentMethod): SupportedPaymentMethod {
  const method = pickString(data, ["method", "method.type", "payment.method", "single.method"]).toLowerCase();

  if (method === "mbw" || method === "mbway") {
    return "mbway";
  }
  if (method === "mb" || method === "multibanco") {
    return "multibanco";
  }

  return fallback;
}

function resolveExpiresAt(data: Record<string, unknown>) {
  const explicit = pickString(data, [
    "expiration_time",
    "expires_at",
    "capture.expiration_time",
    "payment.expiration_time",
    "multibanco.expiration_time",
  ]);

  if (explicit) {
    return explicit;
  }

  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

async function createRealProviderIntent(input: CreateIntentInput): Promise<ProviderIntentResponse> {
  const endpointFromEnv = process.env.PAYMENTS_PROVIDER_CREATE_INTENT_URL;
  const baseUrl = normalizeBaseUrl(process.env.PAYMENTS_PROVIDER_BASE_URL ?? "https://api.test.easypay.pt/2.0");
  const endpoint = endpointFromEnv || `${baseUrl}/single`;
  const accountId = process.env.PAYMENTS_PROVIDER_ACCOUNT_ID;
  const apiKey = process.env.PAYMENTS_PROVIDER_API_KEY;

  if (!endpoint || !accountId || !apiKey) {
    throw new Error("Real provider env vars are missing");
  }

  const easypayMethod = normalizeEasypayMethod(input.method);
  const customer: Record<string, unknown> = {};

  if (input.method === "mbway" && input.mbwayPhone) {
    customer.phone = input.mbwayPhone;
  }
  if (input.receiptEmail) {
    customer.email = input.receiptEmail;
  }
  if (input.nif) {
    customer.fiscal_number = input.nif;
  }

  const requestBody: Record<string, unknown> = {
    type: "sale",
    value: Number(input.amount.toFixed(2)),
    currency: input.currency,
    method: easypayMethod,
    key: `charge:${input.chargeId}`,
    capture: {
      descriptive: `Charge ${input.chargeId}`,
    },
  };

  if (Object.keys(customer).length > 0) {
    requestBody.customer = customer;
  }

  const idempotencyKey = randomUUID();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      AccountId: accountId,
      ApiKey: apiKey,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });

  let data: RealProviderApiResponse = {};
  try {
    data = (await response.json()) as RealProviderApiResponse;
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message = getString(data, "message") || "Real provider create-intent call failed";
    throw new Error(message);
  }

  const externalRequestId = pickString(data, ["id", "payment.id", "single.id"]);

  if (!externalRequestId) {
    throw new Error("Real provider returned an invalid response");
  }

  const method = extractEasypayMethod(data, input.method);
  const expiresAt = resolveExpiresAt(data);

  const payment = getRecord(data, "payment");
  const multibanco = getRecord(data, "multibanco");
  const methodData = getRecord(data, "method");
  const capture = getRecord(data, "capture");

  const externalReference =
    pickString(multibanco, ["reference"]) ||
    pickString(methodData, ["reference"]) ||
    pickString(payment, ["reference"]) ||
    pickString(capture, ["reference"]) ||
    pickString(data, ["reference"]);
  const externalEntity =
    pickString(multibanco, ["entity"]) ||
    pickString(methodData, ["entity"]) ||
    pickString(payment, ["entity"]) ||
    pickString(capture, ["entity"]) ||
    pickString(data, ["entity"]);

  let instructions: MbwayInstructions | MultibancoInstructions;

  if (method === "mbway") {
    const mbwayPhone =
      pickString(getRecord(data, "customer"), ["phone"]) ||
      pickString(payment, ["phone"]) ||
      input.mbwayPhone ||
      "";

    instructions = {
      phone: mbwayPhone,
      message: "Pedido MB Way enviado. Confirma o pagamento na app do teu banco.",
    };
  } else {
    const amount = pickNumber(data, ["value", "payment.value", "capture.values.requested", "capture.values.paid"]);

    instructions = {
      entity: externalEntity,
      reference: externalReference,
      amount: Number.isFinite(amount) ? amount : input.amount,
      message: "Usa a entidade e referencia para concluir o pagamento no Multibanco/Homebanking.",
    };
  }

  return {
    provider: "easypay",
    method,
    externalRequestId,
    expiresAt,
    externalReference: externalReference || null,
    externalEntity: externalEntity || null,
    instructions,
  };
}

export async function createPaymentIntent(input: CreateIntentInput): Promise<ProviderIntentResponse> {
  const mode = getProviderMode();

  if (mode === "real") {
    return createRealProviderIntent(input);
  }

  const mock = createMockIntent({
    chargeId: input.chargeId,
    amount: input.amount,
    method: input.method,
    phone: input.mbwayPhone,
    email: input.receiptEmail,
    nif: input.nif,
  });

  return {
    provider: mock.provider,
    method: mock.method,
    externalRequestId: mock.externalRequestId,
    expiresAt: mock.expiresAt,
    externalReference: mock.method === "multibanco" ? mock.instructions.reference : null,
    externalEntity: mock.method === "multibanco" ? mock.instructions.entity : null,
    instructions: mock.instructions,
  };
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const signatureSecret = process.env.PAYMENTS_WEBHOOK_SIGNATURE_SECRET;

  if (!signatureSecret) {
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const expectedHex = createHmac("sha256", signatureSecret).update(rawBody).digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(signatureHeader.replace(/^sha256=/i, ""), "hex");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}
