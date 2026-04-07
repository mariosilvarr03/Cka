"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PaymentMethod = "mbway" | "multibanco";

type MbwayInstructions = {
  phone: string;
  message: string;
};

type MultibancoInstructions = {
  entity: string;
  reference: string;
  amount: number;
  message: string;
};

type IntentResponse = {
  intent: {
    id: string;
    status: string;
    expires_at: string | null;
  };
  method: PaymentMethod;
  instructions: MbwayInstructions | MultibancoInstructions;
};

type IntentStatusResponse = {
  intent: {
    id: string;
    status: "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";
    expires_at: string | null;
    paid_at: string | null;
    last_error: string | null;
  };
};

type OpenIntentResponse =
  | {
      intent: null;
    }
  | {
      intent: {
        id: string;
        status: "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";
        expires_at: string | null;
        paid_at: string | null;
        last_error: string | null;
      };
      method: PaymentMethod;
      instructions: MbwayInstructions | MultibancoInstructions;
    };

type PaymentMethodFormProps = {
  chargeId: string;
  amount: number;
};

export default function PaymentMethodForm({ chargeId, amount }: PaymentMethodFormProps) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethod>("mbway");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intentResult, setIntentResult] = useState<IntentResponse | null>(null);
  const [intentStatus, setIntentStatus] = useState<IntentStatusResponse["intent"]["status"] | null>(null);
  const [intentPaidAt, setIntentPaidAt] = useState<string | null>(null);
  const [intentLastError, setIntentLastError] = useState<string | null>(null);
  const paymentRefreshTriggered = useRef(false);

  const formattedAmount = useMemo(() => `${amount.toFixed(2)} EUR`, [amount]);

  async function loadOpenIntent() {
    const response = await fetch(`/api/payments/open-intent?chargeId=${chargeId}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as OpenIntentResponse;

    if (!data.intent) {
      return;
    }

    setMethod(data.method);
    setIntentResult({
      intent: {
        id: data.intent.id,
        status: data.intent.status,
        expires_at: data.intent.expires_at,
      },
      method: data.method,
      instructions: data.instructions,
    });
    setIntentStatus(data.intent.status);
    setIntentPaidAt(data.intent.paid_at);
    setIntentLastError(data.intent.last_error);
    paymentRefreshTriggered.current = false;
  }

  useEffect(() => {
    void loadOpenIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeId]);

  useEffect(() => {
    const intentId = intentResult?.intent.id;

    if (!intentId || (intentStatus !== "created" && intentStatus !== "pending")) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      const response = await fetch(`/api/payments/intent-status?intentId=${intentId}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const statusData = (await response.json()) as IntentStatusResponse;
      setIntentStatus(statusData.intent.status);
      setIntentPaidAt(statusData.intent.paid_at);
      setIntentLastError(statusData.intent.last_error);

      if (statusData.intent.status === "paid" && !paymentRefreshTriggered.current) {
        paymentRefreshTriggered.current = true;
        router.refresh();
      }
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [intentResult?.intent.id, intentStatus, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setIntentResult(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const payload: {
      chargeId: string;
      method: PaymentMethod;
      mbwayPhone?: string;
      receiptEmail?: string;
      nif?: string;
    } = {
      chargeId,
      method,
    };

    if (method === "mbway") {
      payload.mbwayPhone = String(formData.get("mbway_phone") ?? "").trim();
    } else {
      payload.receiptEmail = String(formData.get("multibanco_email") ?? "").trim();
      const nif = String(formData.get("multibanco_nif") ?? "").trim();
      if (nif) {
        payload.nif = nif;
      }
    }

    const response = await fetch("/api/payments/create-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as IntentResponse | { error?: string };
    setLoading(false);

    if (!response.ok) {
      const errorText = ("error" in data && data.error) || "Falha ao iniciar pagamento.";
      setError(errorText);

      if (response.status === 409 && errorText.toLowerCase().includes("tentativa de pagamento em curso")) {
        await loadOpenIntent();
      }
      return;
    }

    const successData = data as IntentResponse;
    setIntentResult(successData);
    setIntentStatus((successData.intent.status as IntentStatusResponse["intent"]["status"]) ?? "pending");
    setIntentPaidAt(null);
    setIntentLastError(null);
    paymentRefreshTriggered.current = false;
  }

  function statusLabel(status: IntentStatusResponse["intent"]["status"]) {
    switch (status) {
      case "created":
        return { text: "A iniciar", className: "bg-amber-100 text-amber-800", next: "Aguarde, estamos a preparar o pagamento." };
      case "pending":
        return { text: "Pendente", className: "bg-amber-100 text-amber-800", next: "Aguarde confirmacao ou conclua o pagamento conforme instrucoes." };
      case "paid":
        return { text: "Pago", className: "bg-emerald-100 text-emerald-800", next: "Pagamento concluido com sucesso." };
      case "expired":
        return { text: "Expirado", className: "bg-zinc-200 text-zinc-700", next: "O pagamento expirou. Por favor, gere novo pagamento." };
      case "failed":
        return { text: "Falhado", className: "bg-red-100 text-red-700", next: "O pagamento falhou. Tente novamente ou contacte o clube." };
      case "cancelled":
        return { text: "Cancelado", className: "bg-zinc-200 text-zinc-700", next: "Pagamento cancelado. Se necessario, gere novo pagamento." };
    }
    return { text: status, className: "bg-zinc-200 text-zinc-700", next: "" };
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Metodo de pagamento</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 transition ${method === "mbway" ? "border-brand/60 ring-2 ring-brand/20" : "border-line"}`}>
            <input
              type="radio"
              name="payment_method"
              value="mbway"
              checked={method === "mbway"}
              onChange={() => setMethod("mbway")}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <strong className="block text-zinc-900">MB Way</strong>
              <span className="text-sm text-zinc-600">Pagamento imediato no telemovel.</span>
            </span>
          </label>

          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 transition ${method === "multibanco" ? "border-brand/60 ring-2 ring-brand/20" : "border-line"}`}>
            <input
              type="radio"
              name="payment_method"
              value="multibanco"
              checked={method === "multibanco"}
              onChange={() => setMethod("multibanco")}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <strong className="block text-zinc-900">Multibanco</strong>
              <span className="text-sm text-zinc-600">Gera entidade e referencia para pagamento.</span>
            </span>
          </label>
        </div>
      </div>

      {method === "mbway" ? (
        <div className="space-y-4 rounded-xl border border-line/80 bg-white/80 p-4">
          <h2 className="text-base font-semibold text-zinc-900">Dados MB Way</h2>
          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Numero de telemovel
            <input
              type="tel"
              name="mbway_phone"
              required
              placeholder="Ex: 912345678"
              pattern="[0-9]{9}"
              className="h-11 rounded-lg border border-line bg-white px-3 text-zinc-900"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Nome no recibo
            <input
              type="text"
              name="mbway_name"
              required
              placeholder="Nome completo"
              className="h-11 rounded-lg border border-line bg-white px-3 text-zinc-900"
            />
          </label>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-line/80 bg-white/80 p-4">
          <h2 className="text-base font-semibold text-zinc-900">Dados Multibanco</h2>
          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Email para comprovativo
            <input
              type="email"
              name="multibanco_email"
              required
              placeholder="atleta@exemplo.pt"
              className="h-11 rounded-lg border border-line bg-white px-3 text-zinc-900"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            NIF (opcional)
            <input
              type="text"
              name="multibanco_nif"
              inputMode="numeric"
              pattern="[0-9]{9}"
              placeholder="123456789"
              className="h-11 rounded-lg border border-line bg-white px-3 text-zinc-900"
            />
          </label>
        </div>
      )}

      <div className="rounded-xl border border-line/80 bg-white/75 p-4 text-sm text-zinc-700">
        <p>
          <strong>Referencia da cobranca:</strong> {chargeId}
        </p>
        <p>
          <strong>Valor a pagar:</strong> {formattedAmount}
        </p>
      </div>


      <button
        type="submit"
        disabled={loading}
        className="btn-primary h-11 w-full rounded-lg px-5 font-semibold disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:w-auto"
      >
        {loading ? "A iniciar..." : "Continuar para pagamento"}
      </button>

      {error ? (
        <div className="rounded-lg border border-danger/20 bg-red-50 p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {intentResult && intentStatus ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-zinc-700">Estado da tentativa:</span>
            <span className={`badge ${statusLabel(intentStatus).className}`}>{statusLabel(intentStatus).text}</span>
          </div>
          <div className="text-xs text-zinc-600">
            {statusLabel(intentStatus).next}
          </div>
        </div>
      ) : null}

      {intentResult && intentResult.method === "mbway" ? (
        <div className="rounded-lg border border-ok/20 bg-emerald-50 p-4 text-sm text-emerald-800 break-words">
          <p className="font-semibold">Pagamento MB Way iniciado</p>
          <p className="mt-1">{(intentResult.instructions as MbwayInstructions).message}</p>
          <p className="mt-1">
            <strong>Telemovel:</strong> {(intentResult.instructions as MbwayInstructions).phone}
          </p>
          <p className="mt-1">
            <strong>Validade:</strong>{" "}
            {intentResult.intent.expires_at
              ? new Date(intentResult.intent.expires_at).toLocaleString("pt-PT")
              : "-"}
          </p>
          {intentPaidAt ? (
            <p className="mt-1">
              <strong>Pago em:</strong> {new Date(intentPaidAt).toLocaleString("pt-PT")}
            </p>
          ) : null}
          {intentLastError ? (
            <p className="mt-1 text-red-700">
              <strong>Detalhe:</strong> {intentLastError}
            </p>
          ) : null}
        </div>
      ) : null}

      {intentResult && intentResult.method === "multibanco" ? (
        <div className="rounded-lg border border-ok/20 bg-emerald-50 p-4 text-sm text-emerald-800 break-words">
          <p className="font-semibold">Referencia Multibanco gerada</p>
          <p className="mt-1">{(intentResult.instructions as MultibancoInstructions).message}</p>
          <p className="mt-1">
            <strong>Entidade:</strong> <span className="font-mono tracking-wide">{(intentResult.instructions as MultibancoInstructions).entity}</span>
          </p>
          <p className="mt-1">
            <strong>Referencia:</strong> <span className="font-mono tracking-wide">{(intentResult.instructions as MultibancoInstructions).reference}</span>
          </p>
          <p className="mt-1">
            <strong>Valor:</strong> {(intentResult.instructions as MultibancoInstructions).amount.toFixed(2)} EUR
          </p>
          <p className="mt-1">
            <strong>Validade:</strong>{" "}
            {intentResult.intent.expires_at
              ? new Date(intentResult.intent.expires_at).toLocaleString("pt-PT")
              : "-"}
          </p>
          {intentPaidAt ? (
            <p className="mt-1">
              <strong>Pago em:</strong> {new Date(intentPaidAt).toLocaleString("pt-PT")}
            </p>
          ) : null}
          {intentLastError ? (
            <p className="mt-1 text-red-700">
              <strong>Detalhe:</strong> {intentLastError}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}



