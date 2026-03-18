import { randomUUID } from "crypto";

export type SupportedPaymentMethod = "mbway" | "multibanco";

type CreateMockIntentInput = {
  amount: number;
  method: SupportedPaymentMethod;
  chargeId: string;
  phone?: string;
  email?: string;
  nif?: string;
};

type MbwayIntentResult = {
  provider: "mock_gateway";
  method: "mbway";
  externalRequestId: string;
  expiresAt: string;
  instructions: {
    phone: string;
    message: string;
  };
};

type MultibancoIntentResult = {
  provider: "mock_gateway";
  method: "multibanco";
  externalRequestId: string;
  expiresAt: string;
  instructions: {
    entity: string;
    reference: string;
    amount: number;
    message: string;
  };
};

export type MockIntentResult = MbwayIntentResult | MultibancoIntentResult;

function generateDigits(length: number) {
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += Math.floor(Math.random() * 10).toString();
  }
  return output;
}

export function createMockIntent(input: CreateMockIntentInput): MockIntentResult {
  const externalRequestId = `mock_${randomUUID()}`;

  if (input.method === "mbway") {
    if (!input.phone || !/^\d{9}$/.test(input.phone)) {
      throw new Error("invalid mbway phone");
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      provider: "mock_gateway",
      method: "mbway",
      externalRequestId,
      expiresAt,
      instructions: {
        phone: input.phone,
        message: "Pedido MB Way criado. Confirma o pagamento na app MB Way.",
      },
    };
  }

  const entity = "12345";
  const reference = `${generateDigits(3)} ${generateDigits(3)} ${generateDigits(3)}`;
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  return {
    provider: "mock_gateway",
    method: "multibanco",
    externalRequestId,
    expiresAt,
    instructions: {
      entity,
      reference,
      amount: input.amount,
      message: "Usa a entidade e referencia para pagar no Multibanco/Homebanking.",
    },
  };
}
