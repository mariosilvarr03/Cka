import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type AdminPageProps = {
  searchParams: Promise<{
    month?: string;
    year?: string;
    q?: string;
    paymentStatus?: string;
    ok?: string;
    error?: string;
  }>;
};

type Charge = {
  id: string;
  athlete_user_id: string;
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

type AthleteProfile = {
  user_id: string;
  full_name: string;
  email: string | null;
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

function formatMonthYear(month: number, year: number) {
  const monthName = monthFormatter.format(new Date(year, month - 1, 1));
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  async function markCashPayment(formData: FormData) {
    "use server";

    const chargeId = String(formData.get("charge_id") ?? "");
    const rawAmount = String(formData.get("amount") ?? "0");
    const notes = String(formData.get("notes") ?? "").trim();
    const month = Number(formData.get("month") ?? 0);
    const year = Number(formData.get("year") ?? 0);
    const search = String(formData.get("q") ?? "").trim();
    const paymentStatus = String(formData.get("payment_status") ?? "all");

    const redirectParams = new URLSearchParams({
      month: String(month),
      year: String(year),
    });

    if (search) {
      redirectParams.set("q", search);
    }

    if (paymentStatus === "paid" || paymentStatus === "pending") {
      redirectParams.set("paymentStatus", paymentStatus);
    }

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

    if (profile?.role !== "admin") {
      redirect("/");
    }

    const amount = Number(rawAmount);

    if (!chargeId || Number.isNaN(amount) || amount <= 0) {
      redirect(`/admin?${redirectParams.toString()}&error=Dados+invalidos`);
    }

    const { error } = await supabase.rpc("admin_mark_cash_payment", {
      p_charge_id: chargeId,
      p_amount: amount,
      p_notes: notes || null,
    });

    if (error) {
      redirect(`/admin?${redirectParams.toString()}&error=Falha+ao+marcar+pagamento`);
    }

    revalidatePath("/admin");
    revalidatePath("/");
    redirect(`/admin?${redirectParams.toString()}&ok=1`);
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
  const searchQuery = String(params.q ?? "").trim().toLowerCase();
  const paymentStatus =
    params.paymentStatus === "paid" || params.paymentStatus === "pending"
      ? params.paymentStatus
      : "all";
  const isGlobalSearch = searchQuery.length > 0;

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
    .select("role, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  let chargesQuery = supabase
    .from("charges")
    .select("id, athlete_user_id, product_id, amount, status, due_date, billing_month, billing_year")
    .order("billing_year", { ascending: false })
    .order("billing_month", { ascending: false })
    .order("due_date", { ascending: true });

  if (!isGlobalSearch) {
    chargesQuery = chargesQuery.eq("billing_month", selectedMonth).eq("billing_year", selectedYear);
  }

  const { data: charges, error: chargesError } = await chargesQuery.returns<Charge[]>();

  const athleteIds = [...new Set((charges ?? []).map((c) => c.athlete_user_id))];
  const productIds = [...new Set((charges ?? []).map((c) => c.product_id))];
  const chargeIds = (charges ?? []).map((c) => c.id);

  const { data: athletes } = athleteIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", athleteIds)
        .returns<AthleteProfile[]>()
    : { data: [] as AthleteProfile[] };

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

  const athletesById = new Map((athletes ?? []).map((a) => [a.user_id, a]));
  const productsById = new Map((products ?? []).map((p) => [p.id, p]));
  const latestPaymentByChargeId = new Map<string, Payment>();

  for (const payment of payments ?? []) {
    if (!latestPaymentByChargeId.has(payment.charge_id)) {
      latestPaymentByChargeId.set(payment.charge_id, payment);
    }
  }

  const filteredCharges = (charges ?? []).filter((charge) => {
    const athlete = athletesById.get(charge.athlete_user_id);
    const product = productsById.get(charge.product_id);
    const payment = latestPaymentByChargeId.get(charge.id);
    const alreadyPaid = charge.status === "paid" || Boolean(payment);

    const athleteName = (athlete?.full_name ?? "").toLowerCase();
    const athleteEmail = (athlete?.email ?? "").toLowerCase();
    const productName = (product?.name ?? "").toLowerCase();
    const athleteId = (athlete?.user_id ?? "").toLowerCase();
    const matchesSearch =
      !searchQuery ||
      athleteName.includes(searchQuery) ||
      athleteEmail.includes(searchQuery) ||
      productName.includes(searchQuery) ||
      athleteId.includes(searchQuery);

    const matchesPaymentStatus =
      paymentStatus === "all" ||
      (paymentStatus === "paid" ? alreadyPaid : !alreadyPaid);

    return matchesSearch && matchesPaymentStatus;
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-5 py-8 md:px-8 md:py-10">
      <header className="surface-card mb-8 rounded-2xl p-5 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Painel de Administracao</p>
          <h1 className="section-title text-foreground">Controlo de pagamentos</h1>
          <p className="muted">
            Admin: {profile.full_name} | {isGlobalSearch ? "Pesquisa global" : `Periodo: ${formatMonthYear(selectedMonth, selectedYear)}`}
          </p>
        </div>

        <Link
          href="/"
          className="btn-ghost inline-flex h-10 items-center rounded-lg px-4 font-medium hover:bg-white"
        >
          Voltar ao portal atleta
        </Link>
        </div>
      </header>

      <section className="surface-card mb-6 rounded-2xl p-4 md:p-5">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1.5fr_1fr_auto] md:items-end">
          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Mes
            <select
              name="month"
              defaultValue={selectedMonth}
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {monthFormatter.format(new Date(2026, month - 1, 1))}
                </option>
              ))}
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

          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Pesquisar atleta
            <input
              type="text"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Ex: atleta1"
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Estado
            <select
              name="paymentStatus"
              defaultValue={paymentStatus}
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
            >
              <option value="all">Todos</option>
              <option value="pending">Por pagar</option>
              <option value="paid">Pago</option>
            </select>
          </label>

          <button type="submit" className="btn-primary h-10 rounded-lg px-4 font-semibold">
            Aplicar filtros
          </button>
        </form>
      </section>

      {params.ok ? (
        <div className="surface-card mb-4 rounded-lg border border-ok/20 bg-emerald-50 p-3 text-sm text-ok">
          Pagamento em mao marcado com sucesso.
        </div>
      ) : null}

      {params.error ? (
        <div className="surface-card mb-4 rounded-lg border border-danger/20 bg-red-50 p-3 text-sm text-danger">
          {params.error}
        </div>
      ) : null}

      {chargesError ? (
        <div className="surface-card rounded-xl border border-danger/20 bg-red-50 p-4 text-danger">
          Nao foi possivel carregar as cobrancas para este periodo.
        </div>
      ) : null}

      {!chargesError && filteredCharges.length === 0 ? (
        <div className="surface-card rounded-xl p-6 text-zinc-700">
          Sem cobrancas encontradas com os filtros atuais.
        </div>
      ) : null}

      <section className="space-y-4">
        {filteredCharges.map((charge) => {
          const athlete = athletesById.get(charge.athlete_user_id);
          const product = productsById.get(charge.product_id);
          const payment = latestPaymentByChargeId.get(charge.id);
          const alreadyPaid = charge.status === "paid" || Boolean(payment);

          return (
            <article key={charge.id} className="surface-card rounded-2xl p-5 md:p-6">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">
                    {athlete?.full_name ?? "Atleta"} - {product?.name ?? "Cobranca"}
                  </h2>
                  <p className="text-sm text-zinc-600">
                    Valor: {charge.amount.toFixed(2)} EUR | Vencimento: {charge.due_date ?? "-"}
                  </p>
                  {athlete?.email ? <p className="text-sm text-zinc-500">{athlete.email}</p> : null}
                </div>

                <span
                  className={`badge ${
                    alreadyPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {alreadyPaid ? "Pago" : "Pendente"}
                </span>
              </div>

              {payment ? (
                <p className="mb-3 text-sm text-emerald-700">
                  Ultimo pagamento: {new Date(payment.paid_at).toLocaleString("pt-PT")} ({payment.method})
                </p>
              ) : null}

              {!alreadyPaid ? (
                <form action={markCashPayment} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                  <input type="hidden" name="charge_id" value={charge.id} />
                  <input type="hidden" name="amount" value={String(charge.amount)} />
                  <input type="hidden" name="month" value={String(selectedMonth)} />
                  <input type="hidden" name="year" value={String(selectedYear)} />
                  <input type="hidden" name="q" value={params.q ?? ""} />
                  <input type="hidden" name="payment_status" value={paymentStatus} />

                  <input
                    type="text"
                    name="notes"
                    placeholder="Notas (opcional)"
                    className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
                  />

                  <button type="submit" className="btn-primary h-10 rounded-lg px-4 font-semibold">
                    Marcar pago em mao
                  </button>
                </form>
              ) : null}
            </article>
          );
        })}
      </section>
    </main>
  );
}
