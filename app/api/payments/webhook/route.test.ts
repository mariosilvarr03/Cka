import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  verifyWebhookSignatureMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClientMock,
}));

vi.mock("@/lib/payments/provider", () => ({
  verifyWebhookSignature: mocks.verifyWebhookSignatureMock,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyWebhookSignatureMock.mockReturnValue(true);
  process.env.PAYMENTS_PROVIDER_ACCOUNT_ID = "test-account";
  process.env.PAYMENTS_PROVIDER_API_KEY = "test-key";
  process.env.PAYMENTS_PROVIDER_BASE_URL = "https://api.test.easypay.pt/2.0";
  delete process.env.PAYMENTS_WEBHOOK_SECRET;
});

describe("POST /api/payments/webhook", () => {
  it("returns 401 when webhook signature is invalid", async () => {
    mocks.verifyWebhookSignatureMock.mockReturnValue(false);

    const request = new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "easypay", external_event_id: "evt-1", event_type: "capture", data: {} }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Assinatura de webhook invalida");
  });

  it("returns duplicate true when webhook event already exists", async () => {
    const paymentWebhookEventsTable = {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: "23505" } }),
        }),
      }),
    };

    mocks.createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "payment_webhook_events") {
          return paymentWebhookEventsTable;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const request = new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "mock_gateway",
        external_event_id: "evt-dup-1",
        event_type: "payment.paid",
        data: { status: "paid" },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(body.duplicate).toBe(true);
  });

  it("processes a paid Easypay webhook and confirms external payment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "ep-payment-1",
          type: "capture",
          status: "paid",
          key: "tx-key-1",
          date: "2026-03-18 16:12:00",
          value: 25,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const paymentWebhookEventsTable = {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 15 }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const paymentIntentsTable = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    paymentIntentsTable.select.mockReturnValue(paymentIntentsTable);
    paymentIntentsTable.eq.mockReturnValue(paymentIntentsTable);
    paymentIntentsTable.maybeSingle.mockResolvedValue({
      data: {
        id: "intent-1",
        charge_id: "charge-1",
        amount: 25,
        method: "mbway",
        status: "pending",
      },
    });

    const rpc = vi.fn().mockResolvedValue({ error: null });

    mocks.createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "payment_webhook_events") {
          return paymentWebhookEventsTable;
        }
        if (table === "payment_intents") {
          return paymentIntentsTable;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc,
    });

    const request = new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "ep-payment-1",
        key: "manual-paid-key",
        type: "capture",
        status: "success",
        date: "2026-03-18 16:12:00",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("updates payment_intent status to failed for non-paid Easypay webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "ep-payment-failed",
          type: "capture",
          status: "failed",
          key: "tx-key-failed",
          date: "2026-03-18 16:20:00",
          value: 25,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const paymentWebhookEventsTable = {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 16 }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const paymentIntentsUpdateEq = vi.fn().mockResolvedValue({ error: null });

    const paymentIntentsTable = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      update: vi.fn().mockReturnValue({
        eq: paymentIntentsUpdateEq,
      }),
    };
    paymentIntentsTable.select.mockReturnValue(paymentIntentsTable);
    paymentIntentsTable.eq.mockReturnValue(paymentIntentsTable);
    paymentIntentsTable.maybeSingle.mockResolvedValue({
      data: {
        id: "intent-2",
        charge_id: "charge-2",
        amount: 30,
        method: "mbway",
        status: "pending",
      },
    });

    const rpc = vi.fn().mockResolvedValue({ error: null });

    mocks.createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "payment_webhook_events") {
          return paymentWebhookEventsTable;
        }
        if (table === "payment_intents") {
          return paymentIntentsTable;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc,
    });

    const request = new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "ep-payment-failed",
        key: "manual-failed-key",
        type: "capture",
        status: "failed",
        date: "2026-03-18 16:20:00",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(paymentIntentsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });
});
