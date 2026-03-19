import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AthletePeriodFilterForm from "@/app/components/AthletePeriodFilterForm";

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

type Event = {
  id: string;
  title: string;
  event_date: string;
};

type EventRegistration = {
  event_id: string;
  charge_id: string | null;
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

  const { data: monthlyCharges, error: monthlyChargesError } = await supabase
    .from("charges")
    .select("id, product_id, amount, status, due_date, billing_month, billing_year")
    .eq("athlete_user_id", user.id)
    .eq("billing_month", selectedMonth)
    .eq("billing_year", selectedYear)
    .order("due_date", { ascending: true })
    .returns<Charge[]>();

  const periodStart = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
  const periodEndDate = new Date(selectedYear, selectedMonth, 0);
  const periodEnd = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(periodEndDate.getDate()).padStart(2, "0")}`;

  const { data: periodEvents } = await supabase
    .from("events")
    .select("id, title, event_date")
    .gte("event_date", periodStart)
    .lte("event_date", periodEnd)
    .returns<Event[]>();

  const periodEventIds = [...new Set((periodEvents ?? []).map((event) => event.id))];

  const { data: periodRegistrations } = periodEventIds.length
    ? await supabase
        .from("event_registrations")
        .select("event_id, charge_id")
        .eq("athlete_user_id", user.id)
        .in("event_id", periodEventIds)
        .in("status", ["requested", "confirmed"])
        .returns<EventRegistration[]>()
    : { data: [] as EventRegistration[] };

  const periodEventChargeIds = [
    ...new Set(
      (periodRegistrations ?? [])
        .map((registration) => registration.charge_id)
        .filter((chargeId): chargeId is string => Boolean(chargeId)),
    ),
  ];

  const { data: periodEventCharges } = periodEventChargeIds.length
    ? await supabase
        .from("charges")
        .select("id, product_id, amount, status, due_date, billing_month, billing_year")
        .in("id", periodEventChargeIds)
        .returns<Charge[]>()
    : { data: [] as Charge[] };

  const { data: outstandingCharges, error: outstandingChargesError } = await supabase
    .from("charges")
    .select("id, product_id, amount, status, due_date, billing_month, billing_year")
    .eq("athlete_user_id", user.id)
    .in("status", ["pending", "expired"])
    .order("billing_year", { ascending: true })
    .order("billing_month", { ascending: true })
    .returns<Charge[]>();

  const chargesInPeriod = [...(monthlyCharges ?? []), ...(periodEventCharges ?? [])];
  const combinedCharges = [...chargesInPeriod, ...(outstandingCharges ?? [])];
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

  const { data: registrationsByCharge } = chargeIds.length
    ? await supabase
        .from("event_registrations")
        .select("event_id, charge_id")
        .eq("athlete_user_id", user.id)
        .in("charge_id", chargeIds)
        .returns<EventRegistration[]>()
    : { data: [] as EventRegistration[] };

  const relatedEventIds = [
    ...new Set((registrationsByCharge ?? []).map((registration) => registration.event_id)),
  ];

  const { data: relatedEvents } = relatedEventIds.length
    ? await supabase
        .from("events")
        .select("id, title, event_date")
        .in("id", relatedEventIds)
        .returns<Event[]>()
    : { data: [] as Event[] };

  const productsById = new Map((products ?? []).map((p) => [p.id, p]));
  const paymentsByChargeId = new Map<string, Payment[]>();
  const eventsById = new Map((relatedEvents ?? []).map((event) => [event.id, event]));
  const eventByChargeId = new Map<string, Event>();

  for (const payment of payments ?? []) {
    const list = paymentsByChargeId.get(payment.charge_id) ?? [];
    list.push(payment);
    paymentsByChargeId.set(payment.charge_id, list);
  }

  for (const registration of registrationsByCharge ?? []) {
    if (!registration.charge_id) {
      continue;
    }

    const event = eventsById.get(registration.event_id);
    if (!event) {
      continue;
    }

    eventByChargeId.set(registration.charge_id, event);
  }

  const outstandingOpenCharges = (outstandingCharges ?? []).filter((charge) => {
    const chargePayments = paymentsByChargeId.get(charge.id) ?? [];
    const paid = charge.status === "paid" || chargePayments.length > 0;
    return !paid;
  });

  const paidThisMonth = chargesInPeriod.filter((charge) => {
    const chargePayments = paymentsByChargeId.get(charge.id) ?? [];
    return charge.status === "paid" || chargePayments.length > 0;
  }).length;

  const pendingThisMonth = Math.max(chargesInPeriod.length - paidThisMonth, 0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8 md:px-8 md:py-10">
      <header className="surface-card mb-8 rounded-2xl p-5 md:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Portal do Atleta</p>
            <h1 className="section-title text-foreground">Mensalidades</h1>
            <p className="muted max-w-2xl">Seleciona o mes para veres o estado dos teus pagamentos e regularizares os valores em atraso.</p>
            <p className="text-sm text-zinc-600">Sessao: {user.email}</p>
            <Link href="/conta" scroll={false} className="w-fit text-sm font-semibold text-brand underline decoration-2 underline-offset-4 hover:text-brand-2">
              Mudar Password
            </Link>
            {isAdmin ? (
              <Link href="/admin" scroll={false} className="w-fit text-sm font-semibold text-brand underline decoration-2 underline-offset-4 hover:text-brand-2">
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
        <AthletePeriodFilterForm selectedMonth={selectedMonth} selectedYear={selectedYear} />
      </section>

      <section className="space-y-4">
        {monthlyChargesError ? (
          <div className="surface-card rounded-xl border border-danger/20 bg-red-50 p-4 text-danger">
            Nao foi possivel carregar os pagamentos deste periodo.
          </div>
        ) : null}

        {!monthlyChargesError && chargesInPeriod.length === 0 ? (
          <div className="surface-card rounded-xl p-6 text-zinc-700">
            Nao existem mensalidades ou eventos para {selectedMonth}/{selectedYear}.
          </div>
        ) : null}

        {chargesInPeriod.map((charge) => {
          const product = productsById.get(charge.product_id);
          const event = eventByChargeId.get(charge.id);
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
                  <strong>Tipo:</strong> {product?.type === "event_registration" ? "Evento" : "Mensalidade"}
                </p>
              </div>

              {event ? (
                <p className="mt-2 text-sm text-zinc-700">
                  <strong>Evento:</strong> {event.title} ({new Date(event.event_date).toLocaleDateString("pt-PT")})
                </p>
              ) : null}

              {latestPayment ? (
                <p className="mt-3 text-sm text-emerald-700">
                  Ultimo pagamento: {new Date(latestPayment.paid_at).toLocaleString("pt-PT")} ({latestPayment.method})
                </p>
              ) : null}

              <div className="mt-4">
                {!paid ? (
                  <Link
                    href={`/pagamento/${charge.id}`}
                    scroll={false}
                    className="btn-primary inline-flex h-10 items-center rounded-lg px-4 font-semibold"
                  >
                    {event ? "Pagar inscricao" : "Pagar mensalidade"}
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-10 space-y-4">
        <div className="mb-2">
          <h2 className="section-title text-foreground">Tudo por pagar</h2>
          <p className="muted">Lista de pendentes e atrasados, incluindo mensalidades e eventos.</p>
        </div>

        {outstandingChargesError ? (
          <div className="surface-card rounded-xl border border-danger/20 bg-red-50 p-4 text-danger">
            Nao foi possivel carregar os pagamentos por regularizar.
          </div>
        ) : null}

        {!outstandingChargesError && outstandingOpenCharges.length === 0 ? (
          <div className="surface-card rounded-xl border border-ok/20 bg-emerald-50 p-6 text-ok">
            Nao tens pagamentos em atraso ou pendentes.
          </div>
        ) : null}

        {outstandingOpenCharges.map((charge) => {
          const product = productsById.get(charge.product_id);
          const event = eventByChargeId.get(charge.id);

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
                  <strong>Referencia:</strong> {event ? event.title : `${charge.billing_month ?? "-"}/${charge.billing_year ?? "-"}`}
                </p>
              </div>

              {event ? (
                <p className="mt-2 text-sm text-zinc-700">
                  <strong>Evento:</strong> {new Date(event.event_date).toLocaleDateString("pt-PT")}
                </p>
              ) : null}

              <div className="mt-4">
                <Link
                  href={`/pagamento/${charge.id}`}
                  scroll={false}
                  className="btn-primary inline-flex h-10 items-center rounded-lg px-4 font-semibold"
                >
                  {event ? "Pagar inscricao" : "Pagar mensalidade"}
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
