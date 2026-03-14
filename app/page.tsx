import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{
    month?: string;
    year?: string;
  }>;
};

type Charge = {
  id: string;
  product_id: string;
  amount: number;
  status: "pending" | "paid" | "cancelled" | "expired";
  due_date: string | null;
  billing_month: number | null;
  billing_year: number | null;
};

type Product = {
  id: string;
  name: string;
  type: "monthly_fee" | "event_registration" | "other";
};

type Payment = {
  charge_id: string;
  amount: number;
  paid_at: string;
  method: string;
};

const monthFormatter = new Intl.DateTimeFormat("pt-PT", {
  month: "long",
});

function statusBadge(status: Charge["status"], isPaidByPayment: boolean) {
  if (status === "paid" || isPaidByPayment) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (status === "pending") {
    return "bg-amber-100 text-amber-800";
  }

  if (status === "expired") {
    return "bg-rose-100 text-rose-800";
  }

  return "bg-zinc-200 text-zinc-700";
}

export default async function Home({ searchParams }: PageProps) {
  async function signOut() {
    "use server";

    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  const params = await searchParams;
  const today = new Date();
  const rawMonth = Number(params.month);
  const rawYear = Number(params.year);
  const selectedMonth =
    Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12
      ? rawMonth
      : today.getMonth() + 1;
  const selectedYear =
    Number.isInteger(rawYear) && rawYear >= 2020 && rawYear <= 2100
      ? rawYear
      : today.getFullYear();

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from({ length: 3 }, (_, i) => today.getFullYear() - 1 + i);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";

  const { data: charges, error: chargesError } = await supabase
    .from("charges")
    .select("id, product_id, amount, status, due_date, billing_month, billing_year")
    .eq("athlete_user_id", user.id)
    .eq("billing_month", selectedMonth)
    .eq("billing_year", selectedYear)
    .order("due_date", { ascending: true })
    .returns<Charge[]>();

  const { data: outstandingCharges, error: outstandingChargesError } = await supabase
    .from("charges")
    .select("id, product_id, amount, status, due_date, billing_month, billing_year")
    .eq("athlete_user_id", user.id)
    .in("status", ["pending", "expired"])
    .order("billing_year", { ascending: true })
    .order("billing_month", { ascending: true })
    .returns<Charge[]>();

  const combinedCharges = [...(charges ?? []), ...(outstandingCharges ?? [])];
  const productIds = [...new Set(combinedCharges.map((c) => c.product_id))];
  const chargeIds = [...new Set(combinedCharges.map((c) => c.id))];

  const { data: products } = productIds.length
    ? await supabase
        .from("products")
        .select("id, name, type")
        .in("id", productIds)
        .returns<Product[]>()
    : { data: [] as Product[] };

  const { data: payments } = chargeIds.length
    ? await supabase
        .from("payments")
        .select("charge_id, amount, paid_at, method")
        .in("charge_id", chargeIds)
        .order("paid_at", { ascending: false })
        .returns<Payment[]>()
    : { data: [] as Payment[] };

  const productsById = new Map((products ?? []).map((p) => [p.id, p]));
  const paymentsByChargeId = new Map<string, Payment[]>();

  for (const payment of payments ?? []) {
    const list = paymentsByChargeId.get(payment.charge_id) ?? [];
    list.push(payment);
    paymentsByChargeId.set(payment.charge_id, list);
  }

  const outstandingMonthlyCharges = (outstandingCharges ?? []).filter((charge) => {
    const product = productsById.get(charge.product_id);
    const chargePayments = paymentsByChargeId.get(charge.id) ?? [];
    const paid = charge.status === "paid" || chargePayments.length > 0;
    return (product?.type ?? "monthly_fee") === "monthly_fee" && !paid;
  });

  const paidThisMonth = (charges ?? []).filter((charge) => {
    const chargePayments = paymentsByChargeId.get(charge.id) ?? [];
    return charge.status === "paid" || chargePayments.length > 0;
  }).length;

  const pendingThisMonth = Math.max((charges?.length ?? 0) - paidThisMonth, 0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8 md:px-8 md:py-10">
      <header className="surface-card mb-8 rounded-2xl p-5 md:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Portal do Atleta</p>
            <h1 className="section-title text-foreground">Mensalidades</h1>
            <p className="muted max-w-2xl">Seleciona o mes para veres o estado dos teus pagamentos e regularizares os valores em atraso.</p>
            <p className="text-sm text-zinc-600">Sessao: {user.email}</p>
            {isAdmin ? (
              <Link href="/admin" className="w-fit text-sm font-semibold text-brand underline decoration-2 underline-offset-4 hover:text-brand-2">
                Ir para painel admin
              </Link>
            ) : null}
          </div>

          <form action={signOut}>
            <button type="submit" className="btn-ghost h-10 rounded-lg px-4 font-medium hover:bg-white">
              Terminar sessao
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-line/80 bg-white/75 p-4">
            <p className="text-xs uppercase tracking-widest text-muted">Periodo</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{selectedMonth}/{selectedYear}</p>
          </div>
          <div className="rounded-xl border border-line/80 bg-white/75 p-4">
            <p className="text-xs uppercase tracking-widest text-muted">Pagas no periodo</p>
            <p className="mt-1 text-xl font-semibold text-ok">{paidThisMonth}</p>
          </div>
          <div className="rounded-xl border border-line/80 bg-white/75 p-4">
            <p className="text-xs uppercase tracking-widest text-muted">Pendentes no periodo</p>
            <p className="mt-1 text-xl font-semibold text-warn">{pendingThisMonth}</p>
          </div>
        </div>
      </header>

      <section className="surface-card mb-8 rounded-2xl p-4 md:p-5">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Mes
            <select
              name="month"
              defaultValue={selectedMonth}
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
            >
              {months.map((month) => {
                const monthName = monthFormatter.format(new Date(2026, month - 1, 1));
                return (
                  <option key={month} value={month}>
                    {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Ano
            <select
              name="year"
              defaultValue={selectedYear}
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="btn-primary h-10 rounded-lg px-5 font-semibold">
            Ver estado
          </button>
        </form>
      </section>

      <section className="space-y-4">
        {chargesError ? (
          <div className="surface-card rounded-xl border border-danger/20 bg-red-50 p-4 text-danger">
            Nao foi possivel carregar as cobrancas deste mes.
          </div>
        ) : null}

        {!chargesError && (charges?.length ?? 0) === 0 ? (
          <div className="surface-card rounded-xl p-6 text-zinc-700">
            Nao existem cobrancas para {selectedMonth}/{selectedYear}.
          </div>
        ) : null}

        {(charges ?? []).map((charge) => {
          const product = productsById.get(charge.product_id);
          const chargePayments = paymentsByChargeId.get(charge.id) ?? [];
          const latestPayment = chargePayments[0];
          const paid = charge.status === "paid" || chargePayments.length > 0;

          return (
            <article key={charge.id} className="surface-card rounded-2xl p-5 md:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-zinc-900">
                  {product?.name ?? "Mensalidade"}
                </h2>
                <span
                  className={`badge ${statusBadge(
                    charge.status,
                    paid,
                  )}`}
                >
                  {paid ? "Pago" : "Pendente"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm text-zinc-700 md:grid-cols-3">
                <p>
                  <strong>Valor:</strong> {charge.amount.toFixed(2)} EUR
                </p>
                <p>
                  <strong>Vencimento:</strong> {charge.due_date ?? "-"}
                </p>
                <p>
                  <strong>Tipo:</strong> {product?.type ?? "monthly_fee"}
                </p>
              </div>

              {latestPayment ? (
                <p className="mt-3 text-sm text-emerald-700">
                  Ultimo pagamento: {new Date(latestPayment.paid_at).toLocaleString("pt-PT")} ({latestPayment.method})
                </p>
              ) : null}

              <div className="mt-4">
                <button
                  type="button"
                  disabled={paid}
                  className="btn-primary h-10 rounded-lg px-4 font-semibold disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 disabled:text-zinc-600"
                >
                  {paid ? "Ja pago" : "Pagar mensalidade"}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-10 space-y-4">
        <div className="mb-2">
          <h2 className="section-title text-foreground">Mensalidades por pagar</h2>
          <p className="muted">Lista de mensalidades pendentes de pagamento.</p>
        </div>

        {outstandingChargesError ? (
          <div className="surface-card rounded-xl border border-danger/20 bg-red-50 p-4 text-danger">
            Nao foi possivel carregar as mensalidades por pagar.
          </div>
        ) : null}

        {!outstandingChargesError && outstandingMonthlyCharges.length === 0 ? (
          <div className="surface-card rounded-xl border border-ok/20 bg-emerald-50 p-6 text-ok">
            Nao tens mensalidades em atraso ou pendentes.
          </div>
        ) : null}

        {outstandingMonthlyCharges.map((charge) => {
          const product = productsById.get(charge.product_id);

          return (
            <article key={`outstanding-${charge.id}`} className="surface-card rounded-2xl p-5 md:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-zinc-900">
                  {product?.name ?? "Mensalidade"}
                </h2>
                <span className={`badge ${statusBadge(charge.status, false)}`}>
                  Pendente
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm text-zinc-700 md:grid-cols-3">
                <p>
                  <strong>Valor:</strong> {charge.amount.toFixed(2)} EUR
                </p>
                <p>
                  <strong>Vencimento:</strong> {charge.due_date ?? "-"}
                </p>
                <p>
                  <strong>Periodo:</strong> {charge.billing_month ?? "-"}/{charge.billing_year ?? "-"}
                </p>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  className="btn-primary h-10 rounded-lg px-4 font-semibold"
                >
                  Pagar mensalidade
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
