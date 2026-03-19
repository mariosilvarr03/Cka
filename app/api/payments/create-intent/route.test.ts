import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  createPaymentIntentMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClientMock,
}));

vi.mock("@/lib/payments/provider", () => ({
  createPaymentIntent: mocks.createPaymentIntentMock,
}));

import { POST } from "./route";

type ChargeRow = {
  id: string;
  athlete_user_id: string;
  amount: number;
  status: "pending" | "paid" | "cancelled" | "expired";
  currency: string;
};

type OpenIntentRow = {
  id: string;
  status: "created" | "pending";
  expires_at: string | null;
};

function makeChargesQuery(charge: ChargeRow | null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: charge });

  return query;
}

function makePaymentsCountQuery(count: number) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.eq.mockResolvedValue({ count });

  return query;
}

function makePaymentIntentsTable(params: {
  openIntent: OpenIntentRow | null;
  insertedIntent?: {
    id: string;
    status: string;
    expires_at: string | null;
    external_request_id: string | null;
    external_reference: string | null;
    external_entity: string | null;
  };
}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: params.openIntent });
  query.update.mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  query.insert.mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: params.insertedIntent ?? null, error: null }),
    }),
  });

  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/payments/create-intent", () => {
  it("returns 400 for invalid payload", async () => {
    const request = new Request("http://localhost/api/payments/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId: "", method: "invalid" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Dados invalidos");
  });

  it("returns 401 when user is not authenticated", async () => {
    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
      from: vi.fn(),
    });

    const request = new Request("http://localhost/api/payments/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId: "charge-1", method: "mbway" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Nao autenticado");
  });

  it("returns 404 when charge is not found for athlete", async () => {
    const chargesQuery = makeChargesQuery(null);

    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "athlete-1" } } }),
      },
      from: vi.fn((table: string) => {
        if (table === "charges") {
          return chargesQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const request = new Request("http://localhost/api/payments/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId: "charge-1", method: "mbway", mbwayPhone: "911234567" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Cobranca nao encontrada");
  });

  it("returns 409 when there is already an open intent for the charge", async () => {
    const charge: ChargeRow = {
      id: "charge-1",
      athlete_user_id: "athlete-1",
      amount: 25,
      status: "pending",
      currency: "EUR",
    };

    const chargesQuery = makeChargesQuery(charge);
    const paymentsCountQuery = makePaymentsCountQuery(0);
    const paymentIntentsTable = makePaymentIntentsTable({
      openIntent: {
        id: "intent-open-1",
        status: "pending",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
    });

    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "athlete-1" } } }),
      },
      from: vi.fn((table: string) => {
        if (table === "charges") {
          return chargesQuery;
        }
        if (table === "payments") {
          return paymentsCountQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    mocks.createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "payment_intents") {
          return paymentIntentsTable;
        }
        throw new Error(`Unexpected admin table: ${table}`);
      }),
    });

    const request = new Request("http://localhost/api/payments/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId: "charge-1", method: "mbway", mbwayPhone: "911234567" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("tentativa de pagamento em curso");
    expect(mocks.createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("creates an intent successfully for a valid request", async () => {
    const charge: ChargeRow = {
      id: "charge-1",
      athlete_user_id: "athlete-1",
      amount: 25,
      status: "pending",
      currency: "EUR",
    };

    const chargesQuery = makeChargesQuery(charge);
    const paymentsCountQuery = makePaymentsCountQuery(0);

    const insertedIntent = {
      id: "intent-1",
      status: "pending",
      expires_at: "2026-03-18T16:00:00.000Z",
      external_request_id: "ep-request-1",
      external_reference: null,
      external_entity: null,
    };

    const paymentIntentsTable = makePaymentIntentsTable({
      openIntent: null,
      insertedIntent,
    });

    mocks.createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "athlete-1" } } }),
      },
      from: vi.fn((table: string) => {
        if (table === "charges") {
          return chargesQuery;
        }
        if (table === "payments") {
          return paymentsCountQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    mocks.createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "payment_intents") {
          return paymentIntentsTable;
        }
        throw new Error(`Unexpected admin table: ${table}`);
      }),
    });

    mocks.createPaymentIntentMock.mockResolvedValue({
      provider: "easypay",
      method: "mbway",
      externalRequestId: "ep-request-1",
      expiresAt: "2026-03-18T16:00:00.000Z",
      externalReference: null,
      externalEntity: null,
      instructions: {
        phone: "911234567",
        message: "Pedido MB Way enviado",
      },
    });

    const request = new Request("http://localhost/api/payments/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId: "charge-1", method: "mbway", mbwayPhone: "911234567" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.intent.id).toBe("intent-1");
    expect(body.provider).toBe("easypay");
    expect(body.method).toBe("mbway");
    expect(mocks.createPaymentIntentMock).toHaveBeenCalledTimes(1);
  });
});
