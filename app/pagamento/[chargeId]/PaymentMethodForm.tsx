"use client";

import { useMemo, useState } from "react";

type PaymentMethod = "mbway" | "multibanco";

type PaymentMethodFormProps = {
  chargeId: string;
  amount: number;
};

export default function PaymentMethodForm({ chargeId, amount }: PaymentMethodFormProps) {
  const [method, setMethod] = useState<PaymentMethod>("mbway");
  const [submitted, setSubmitted] = useState(false);

  const formattedAmount = useMemo(() => `${amount.toFixed(2)} EUR`, [amount]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Metodo de pagamento</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-4">
            <input
              type="radio"
              name="payment_method"
              value="mbway"
              checked={method === "mbway"}
              onChange={() => setMethod("mbway")}
              className="mt-1"
            />
            <span>
              <strong className="block text-zinc-900">MB Way</strong>
              <span className="text-sm text-zinc-600">Pagamento imediato no telemovel.</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-4">
            <input
              type="radio"
              name="payment_method"
              value="multibanco"
              checked={method === "multibanco"}
              onChange={() => setMethod("multibanco")}
              className="mt-1"
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
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Nome no recibo
            <input
              type="text"
              name="mbway_name"
              required
              placeholder="Nome completo"
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
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
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
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
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
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

      <button type="submit" className="btn-primary h-10 rounded-lg px-5 font-semibold">
        Continuar para pagamento
      </button>

      {submitted ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Formulario validado. No proximo passo vamos ligar este envio ao provider real de pagamentos.
        </div>
      ) : null}
    </form>
  );
}
