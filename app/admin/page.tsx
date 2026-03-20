import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminAthleteNameFilterForm from "@/app/components/AdminAthleteNameFilterForm";
import AdminChargesFilterAndExport from "@/app/components/AdminChargesFilterAndExport.client";
type AdminPageProps = {
  searchParams: Promise<{
    month?: string;
    year?: string;
    q?: string;
    paymentStatus?: string;
    eventId?: string;
    athleteName?: string;
    ok?: string;
    error?: string;
    eventOk?: string;
    eventError?: string;
    accountOk?: string;
    accountError?: string;
    reprocessOk?: string;
    reprocessError?: string;
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
  event_id: string | null;
};

type EventOption = {
  id: string;
  title: string;
  event_date: string;
  status: "draft" | "open" | "closed" | "cancelled";
};

type AthleteProfile = {
  user_id: string;
  full_name: string;
  email: string | null;
};

type CategoryOption = {
  id: number;
  name: string;
  monthly_fee: number;
};

type Payment = {
  charge_id: string;
  amount: number;
  paid_at: string;
  method: string;
};

type AdminPaymentStatus = "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";

type PaymentIntentListItem = {
  charge_id: string;
  status: AdminPaymentStatus;
  created_at: string;
};

type PaymentIntentMonitor = {
  id: string;
  charge_id: string;
  provider: string;
  method: string;
  amount: number;
  status: "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";
  external_request_id: string | null;
  last_error: string | null;
  created_at: string;
};

type PaymentWebhookEventMonitor = {
  id: number;
  provider: string;
  external_event_id: string;
  event_type: string | null;
  received_at: string;
  processed_at: string | null;
  processing_error: string | null;
};

type EasypayVerification = {
  status: string;
  type: string;
  key: string;
  date: string;
  value: number;
  entity: string;
  reference: string;
};

function getString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
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

function mapEasypayStatus(status: string, eventType: string) {
  const normalizedStatus = status.toLowerCase();
  const normalizedEvent = eventType.toLowerCase();

  if (normalizedStatus === "paid") {
    return "paid" as const;
  }
  if (normalizedStatus === "success") {
    if (
      normalizedEvent.includes("capture") ||
      normalizedEvent.includes("transaction") ||
      normalizedEvent.includes("sale") ||
      normalizedEvent.includes("paid")
    ) {
      return "paid" as const;
    }
    return "pending" as const;
  }
  if (["pending", "created", "authorised", "authorized", "enrolled"].includes(normalizedStatus)) {
    return "pending" as const;
  }
  if (["failed", "error", "declined"].includes(normalizedStatus)) {
    return "failed" as const;
  }
  if (normalizedStatus === "expired") {
    return "expired" as const;
  }
  if (["cancelled", "canceled", "deleted", "voided"].includes(normalizedStatus)) {
    return "cancelled" as const;
  }

  return null;
}

function amountsMatch(left: number, right: number) {
  return Math.abs(left - right) < 0.005;
}

const monthFormatter = new Intl.DateTimeFormat("pt-PT", {
  month: "long",
});

function formatMonthYear(month: number, year: number) {
  const monthName = monthFormatter.format(new Date(year, month - 1, 1));
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  async function reprocessIntent(formData: FormData) {
    "use server";

    const intentId = String(formData.get("intent_id") ?? "").trim();

    if (!intentId) {
      redirect("/admin?reprocessError=Intent+invalida");
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

    const accountId = process.env.PAYMENTS_PROVIDER_ACCOUNT_ID;
    const apiKey = process.env.PAYMENTS_PROVIDER_API_KEY;
    const baseUrl = (process.env.PAYMENTS_PROVIDER_BASE_URL ?? "https://api.test.easypay.pt/2.0").replace(/\/+$/, "");

    if (!accountId || !apiKey) {
      redirect("/admin?reprocessError=Credenciais+Easypay+em+falta");
    }

    const adminClient = createAdminClient();
    const { data: intent } = await adminClient
      .from("payment_intents")
      .select("id, charge_id, provider, method, amount, status, external_request_id")
      .eq("id", intentId)
      .maybeSingle<{
        id: string;
        charge_id: string;
        provider: string;
        method: "online_card" | "mbway" | "multibanco" | "cash" | "bank_transfer" | "other";
        amount: number;
        status: "created" | "pending" | "paid" | "failed" | "expired" | "cancelled";
        external_request_id: string | null;
      }>();

    if (!intent) {
      redirect("/admin?reprocessError=Intent+nao+encontrada");
    }

    if (intent.provider !== "easypay") {
      redirect("/admin?reprocessError=Reprocessamento+manual+disponivel+apenas+para+Easypay");
    }

    if (!intent.external_request_id) {
      redirect("/admin?reprocessError=Intent+sem+external_request_id");
    }

    if (intent.status === "paid") {
      redirect("/admin?reprocessOk=Intent+ja+estava+paga");
    }

    let verification: EasypayVerification;

    try {
      const response = await fetch(`${baseUrl}/single/${intent.external_request_id}`, {
        method: "GET",
        headers: {
          AccountId: accountId,
          ApiKey: apiKey,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        await adminClient
          .from("payment_intents")
          .update({
            last_error: `Reprocessamento manual falhou na validacao Easypay (${response.status})`,
          })
          .eq("id", intent.id);

        redirect("/admin?reprocessError=Falha+ao+consultar+Easypay");
      }

      const data = (await response.json()) as Record<string, unknown>;
      verification = {
        status: getString(data, "status"),
        type: getString(data, "type"),
        key: getString(data, "key"),
        date: getString(data, "date"),
        value: getNumber(data, "value"),
        entity: getString(data, "entity"),
        reference: getString(data, "reference"),
      };
    } catch {
      await adminClient
        .from("payment_intents")
        .update({
          last_error: "Reprocessamento manual falhou por erro de rede",
        })
        .eq("id", intent.id);

      redirect("/admin?reprocessError=Falha+de+rede+na+consulta+ao+provider");
    }

    const mappedStatus = mapEasypayStatus(verification.status, verification.type);

    if (!mappedStatus) {
      await adminClient
        .from("payment_intents")
        .update({
          last_error: "Estado do provider nao reconhecido em reprocessamento manual",
        })
        .eq("id", intent.id);

      redirect("/admin?reprocessError=Estado+nao+reconhecido+no+provider");
    }

    if (mappedStatus === "paid") {
      const amountFromProvider = Number.isFinite(verification.value) && verification.value > 0
        ? verification.value
        : Number(intent.amount);

      if (!amountsMatch(amountFromProvider, Number(intent.amount))) {
        await adminClient
          .from("payment_intents")
          .update({
            last_error: `Reprocessamento manual com divergencia de valor (${amountFromProvider} vs ${intent.amount})`,
          })
          .eq("id", intent.id);

        redirect("/admin?reprocessError=Valor+divergente+entre+provider+e+cobranca");
      }

      const providerRef = verification.key || verification.reference || intent.external_request_id;
      const paidAt = verification.date || new Date().toISOString();

      const { error: rpcError } = await adminClient.rpc("confirm_external_payment", {
        p_charge_id: intent.charge_id,
        p_amount: Number(intent.amount),
        p_method: intent.method,
        p_provider: "easypay",
        p_provider_ref: providerRef,
        p_paid_at: paidAt,
        p_notes: `Reprocessamento manual admin para ${intent.id}`,
        p_payment_intent_id: intent.id,
      });

      if (rpcError) {
        await adminClient
          .from("payment_intents")
          .update({
            last_error: "Falha no confirm_external_payment em reprocessamento manual",
          })
          .eq("id", intent.id);

        redirect("/admin?reprocessError=Falha+ao+confirmar+pagamento+externo");
      }

      revalidatePath("/admin");
      revalidatePath("/");
      redirect("/admin?reprocessOk=Pagamento+confirmado+por+reprocessamento+manual");
    }

    const externalReference = verification.reference || null;
    const externalEntity = verification.entity || null;
    const lastError = mappedStatus === "pending"
      ? null
      : `Reprocessamento manual: estado ${verification.status || "desconhecido"}`;

    await adminClient
      .from("payment_intents")
      .update({
        status: mappedStatus,
        external_reference: externalReference,
        external_entity: externalEntity,
        last_error: lastError,
      })
      .eq("id", intent.id);

    revalidatePath("/admin");
    redirect(`/admin?reprocessOk=${encodeURIComponent(`Intent atualizada para ${mappedStatus}`)}`);
  }

  async function createAthleteAccount(formData: FormData) {
    "use server";

    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const categoryId = Number(formData.get("category_id") ?? 0);

    if (!fullName || !email || !Number.isInteger(categoryId) || categoryId <= 0) {
      redirect("/admin?accountError=Preenche+nome+email+e+categoria");
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

    const adminClient = createAdminClient();
    const appBaseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    const inviteRedirectTo = appBaseUrl ? `${appBaseUrl}/auth/callback` : undefined;

    const { data: invitedData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
      },
      ...(inviteRedirectTo ? { redirectTo: inviteRedirectTo } : {}),
    });

    if (inviteError || !invitedData.user?.id) {
      if (inviteError?.message?.toLowerCase().includes("already")) {
        redirect("/admin?accountError=Ja+existe+uma+conta+com+esse+email");
      }

      const detailedMessage = inviteError?.message?.trim();
      if (detailedMessage) {
        redirect(`/admin?accountError=${encodeURIComponent(`Falha ao enviar convite: ${detailedMessage}`)}`);
      }

      redirect("/admin?accountError=Falha+ao+enviar+convite+por+email");
    }

    const createdUserId = invitedData.user.id;

    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert(
        {
          user_id: createdUserId,
          full_name: fullName,
          email,
          role: "athlete",
          category_id: categoryId,
          active: true,
        },
        { onConflict: "user_id" },
      );

    if (profileError) {
      redirect("/admin?accountError=Conta+criada+mas+falhou+atualizacao+de+perfil");
    }

    revalidatePath("/admin");
    redirect("/admin?accountOk=1");
  }

  async function createEvent(formData: FormData) {
    "use server";

    const title = String(formData.get("event_title") ?? "").trim();
    const eventDate = String(formData.get("event_date") ?? "").trim();
    const paymentDeadline = String(formData.get("payment_deadline") ?? "").trim();
    const selectedAthleteIds = formData.getAll("athlete_ids").map((value) => String(value));

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

    if (!title || !eventDate) {
      redirect("/admin?eventError=Preenche+nome+e+data+do+evento");
    }

    if (selectedAthleteIds.length === 0) {
      redirect("/admin?eventError=Seleciona+pelo+menos+um+atleta");
    }

    const registrations: Array<{ athlete_user_id: string; amount: number }> = [];

    for (const athleteId of selectedAthleteIds) {
      const rawAmount = String(formData.get(`amount_${athleteId}`) ?? "0").trim();
      const amount = Number(rawAmount);

      if (!Number.isFinite(amount) || amount <= 0) {
        redirect("/admin?eventError=Cada+atleta+inscrito+tem+de+ter+um+valor+de+inscricao+superior+a+0");
      }

      registrations.push({
        athlete_user_id: athleteId,
        amount,
      });
    }

    const { error } = await supabase.rpc("admin_create_event_with_registrations", {
      p_title: title,
      p_event_date: eventDate,
      p_payment_deadline: paymentDeadline || null,
      p_registration_deadline: null,
      p_description: null,
      p_registrations: registrations,
    });

    if (error) {
      redirect(`/admin?eventError=${encodeURIComponent("Falha ao criar evento")}`);
    }

    revalidatePath("/admin");
    revalidatePath("/");
    redirect("/admin?eventOk=1");
  }

  async function markCashPayment(formData: FormData) {
    "use server";

    const chargeId = String(formData.get("charge_id") ?? "");
    const rawAmount = String(formData.get("amount") ?? "0");
    const notes = String(formData.get("notes") ?? "").trim();
    const month = Number(formData.get("month") ?? 0);
    const year = Number(formData.get("year") ?? 0);
    const search = String(formData.get("q") ?? "").trim();
    const paymentStatus = String(formData.get("payment_status") ?? "all");
    const eventId = String(formData.get("event_id") ?? "all");

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

    if (eventId && eventId !== "all") {
      redirectParams.set("eventId", eventId);
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
  const validStatuses = ["created", "pending", "paid", "failed", "expired", "cancelled"] as const;
  const rawPaymentStatus = String(params.paymentStatus ?? "");
  const paymentStatus: "all" | (typeof validStatuses)[number] = validStatuses.includes(rawPaymentStatus as (typeof validStatuses)[number]) ? (rawPaymentStatus as (typeof validStatuses)[number]) : "all";
  const selectedEventId = String(params.eventId ?? "all");
  const athleteNameFilter = String(params.athleteName ?? "").trim().toLowerCase();
  const isGlobalSearch = searchQuery.length > 0 || selectedEventId !== "all";

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
        .select("id, name, type, event_id")
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

  const { data: athleteOptions } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .eq("role", "athlete")
    .eq("active", true)
    .order("full_name", { ascending: true })
    .returns<AthleteProfile[]>();

  const { data: events } = await supabase
    .from("events")
    .select("id, title, event_date, status")
    .order("event_date", { ascending: false })
    .returns<EventOption[]>();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, monthly_fee")
    .eq("active", true)
    .order("name", { ascending: true })
    .returns<CategoryOption[]>();

  const adminClient = createAdminClient();
  const now = new Date();
  const staleIntentsCutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const monitoringWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { count: staleIntentCount } = await adminClient
    .from("payment_intents")
    .select("id", { count: "exact", head: true })
    .in("status", ["created", "pending"])
    .lt("created_at", staleIntentsCutoff);

  const { count: failedIntent24hCount } = await adminClient
    .from("payment_intents")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("updated_at", monitoringWindowStart);

  const { count: paidIntent24hCount } = await adminClient
    .from("payment_intents")
    .select("id", { count: "exact", head: true })
    .eq("status", "paid")
    .gte("updated_at", monitoringWindowStart);

  const { count: webhookReceived24hCount } = await adminClient
    .from("payment_webhook_events")
    .select("id", { count: "exact", head: true })
    .gte("received_at", monitoringWindowStart);

  const { count: webhookError24hCount } = await adminClient
    .from("payment_webhook_events")
    .select("id", { count: "exact", head: true })
    .gte("received_at", monitoringWindowStart)
    .not("processing_error", "is", null);

  const { data: staleIntents } = await adminClient
    .from("payment_intents")
    .select("id, charge_id, provider, method, amount, status, external_request_id, last_error, created_at")
    .in("status", ["created", "pending"])
    .lt("created_at", staleIntentsCutoff)
    .order("created_at", { ascending: true })
    .limit(8)
    .returns<PaymentIntentMonitor[]>();

  const { data: webhookErrors } = await adminClient
    .from("payment_webhook_events")
    .select("id, provider, external_event_id, event_type, received_at, processed_at, processing_error")
    .not("processing_error", "is", null)
    .order("received_at", { ascending: false })
    .limit(8)
    .returns<PaymentWebhookEventMonitor[]>();

  const { data: paymentIntentsByCharge } = chargeIds.length
    ? await adminClient
        .from("payment_intents")
        .select("charge_id, status, created_at")
        .in("charge_id", chargeIds)
        .order("created_at", { ascending: false })
        .returns<PaymentIntentListItem[]>()
    : { data: [] as PaymentIntentListItem[] };

  const filteredAthleteOptions = (athleteOptions ?? []).filter((athlete) => {
    if (!athleteNameFilter) {
      return true;
    }

    return athlete.full_name.toLowerCase().includes(athleteNameFilter);
  });

  const athletesById = new Map((athletes ?? []).map((a) => [a.user_id, a]));
  const productsById = new Map((products ?? []).map((p) => [p.id, p]));
  const latestPaymentByChargeId = new Map<string, Payment>();
  const latestIntentStatusByChargeId = new Map<string, AdminPaymentStatus>();

  for (const payment of payments ?? []) {
    if (!latestPaymentByChargeId.has(payment.charge_id)) {
      latestPaymentByChargeId.set(payment.charge_id, payment);
    }
  }

  for (const intent of paymentIntentsByCharge ?? []) {
    if (!latestIntentStatusByChargeId.has(intent.charge_id)) {
      latestIntentStatusByChargeId.set(intent.charge_id, intent.status);
    }
  }

  function resolveChargePaymentStatus(charge: Charge): AdminPaymentStatus {
    const payment = latestPaymentByChargeId.get(charge.id);
    const alreadyPaid = charge.status === "paid" || Boolean(payment);

    if (alreadyPaid) {
      return "paid";
    }

    const latestIntentStatus = latestIntentStatusByChargeId.get(charge.id);
    if (latestIntentStatus) {
      return latestIntentStatus;
    }

    if (charge.status === "expired") {
      return "expired";
    }

    if (charge.status === "cancelled") {
      return "cancelled";
    }

    return "pending";
  }

  const filteredCharges = (charges ?? []).filter((charge) => {
    const athlete = athletesById.get(charge.athlete_user_id);
    const product = productsById.get(charge.product_id);
    const effectiveStatus = resolveChargePaymentStatus(charge);

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

    const matchesPaymentStatus = paymentStatus === "all" || paymentStatus === effectiveStatus;

    const matchesEvent = selectedEventId === "all" || product?.event_id === selectedEventId;

    return matchesSearch && matchesPaymentStatus && matchesEvent;
  });

  const selectedEvent = (events ?? []).find((event) => event.id === selectedEventId);

  const selectedEventSummary = filteredCharges.reduce(
    (acc, charge) => {
      const payment = latestPaymentByChargeId.get(charge.id);
      const alreadyPaid = charge.status === "paid" || Boolean(payment);

      acc.total += 1;
      if (alreadyPaid) {
        acc.paid += 1;
      } else {
        acc.pending += 1;
      }
      acc.amount += charge.amount;

      return acc;
    },
    { total: 0, paid: 0, pending: 0, amount: 0 },
  );

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
          scroll={false}
          className="btn-ghost inline-flex h-10 items-center rounded-lg px-4 font-medium hover:bg-white"
        >
          Voltar ao portal atleta
        </Link>
        </div>
      </header>

      <section className="surface-card mb-6 rounded-2xl p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Monitorizacao de pagamentos</h2>
            <p className="text-sm text-zinc-600">Saude operacional das ultimas 24 horas e alertas ativos.</p>
          </div>
          <span className="rounded-full border border-line/70 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
            Janela: 24h
          </span>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-line/80 bg-white/80 p-3">
            <p className="text-xs uppercase tracking-widest text-muted">Intents pagas</p>
            <p className="mt-1 text-2xl font-semibold text-ok">{paidIntent24hCount ?? 0}</p>
          </div>
          <div className="rounded-xl border border-line/80 bg-white/80 p-3">
            <p className="text-xs uppercase tracking-widest text-muted">Intents falhadas</p>
            <p className="mt-1 text-2xl font-semibold text-danger">{failedIntent24hCount ?? 0}</p>
          </div>
          <div className="rounded-xl border border-line/80 bg-white/80 p-3">
            <p className="text-xs uppercase tracking-widest text-muted">Pendentes &gt; 30 min</p>
            <p className="mt-1 text-2xl font-semibold text-warn">{staleIntentCount ?? 0}</p>
          </div>
          <div className="rounded-xl border border-line/80 bg-white/80 p-3">
            <p className="text-xs uppercase tracking-widest text-muted">Webhooks recebidos</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{webhookReceived24hCount ?? 0}</p>
          </div>
          <div className="rounded-xl border border-line/80 bg-white/80 p-3">
            <p className="text-xs uppercase tracking-widest text-muted">Erros de webhook</p>
            <p className="mt-1 text-2xl font-semibold text-danger">{webhookError24hCount ?? 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <details className="rounded-xl border border-line/80 bg-white/70 p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.16em] text-zinc-700 [&::-webkit-details-marker]:hidden">
              Intents pendentes antigas
            </summary>
            <div className="mt-3">
              {!staleIntents || staleIntents.length === 0 ? (
                <p className="text-sm text-zinc-600">Sem alertas. Nao existem intents pendentes com mais de 30 minutos.</p>
              ) : (
                <ul className="space-y-2">
                  {staleIntents.map((intent) => (
                    <li key={intent.id} className="rounded-lg border border-line/70 bg-white p-3 text-sm text-zinc-700">
                      <p className="font-semibold text-zinc-900">
                        Charge {intent.charge_id} · {Number(intent.amount).toFixed(2)} EUR
                      </p>
                      <p>
                        Estado: {intent.status} · Metodo: {intent.method} · Provider: {intent.provider}
                      </p>
                      <p>Criada em: {new Date(intent.created_at).toLocaleString("pt-PT")}</p>
                      {intent.external_request_id ? <p>Request: {intent.external_request_id}</p> : null}
                      {intent.last_error ? <p className="text-danger">Erro: {intent.last_error}</p> : null}
                      {intent.provider === "easypay" && intent.external_request_id ? (
                        <form action={reprocessIntent} className="mt-2">
                          <input type="hidden" name="intent_id" value={intent.id} />
                          <button type="submit" className="btn-ghost h-9 rounded-lg px-3 text-xs font-semibold uppercase tracking-[0.14em]">
                            Reprocessar
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          <details className="rounded-xl border border-line/80 bg-white/70 p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.16em] text-zinc-700 [&::-webkit-details-marker]:hidden">
              Ultimos erros de webhook
            </summary>
            <div className="mt-3">
              {!webhookErrors || webhookErrors.length === 0 ? (
                <p className="text-sm text-zinc-600">Sem erros recentes de webhook.</p>
              ) : (
                <ul className="space-y-2">
                  {webhookErrors.map((event) => (
                    <li key={event.id} className="rounded-lg border border-line/70 bg-white p-3 text-sm text-zinc-700">
                      <p className="font-semibold text-zinc-900">
                        {event.provider} · {event.event_type ?? "evento"}
                      </p>
                      <p>Evento: {event.external_event_id}</p>
                      <p>Recebido: {new Date(event.received_at).toLocaleString("pt-PT")}</p>
                      <p className="text-danger">Erro: {event.processing_error}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </div>

        {params.reprocessOk ? (
          <div className="mt-4 rounded-lg border border-ok/20 bg-emerald-50 p-3 text-sm text-ok">
            {params.reprocessOk}
          </div>
        ) : null}

        {params.reprocessError ? (
          <div className="mt-4 rounded-lg border border-danger/20 bg-red-50 p-3 text-sm text-danger">
            {params.reprocessError}
          </div>
        ) : null}
      </section>

      <section className="surface-card mb-6 rounded-2xl p-4 md:p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Criar conta de atleta</h2>
          <p className="text-sm text-zinc-600">Cria a conta e envia convite por email para o atleta definir a password.</p>
        </div>

        <form action={createAthleteAccount} className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end">
          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Nome
            <input
              type="text"
              name="full_name"
              required
              placeholder="Ex: Joao Silva"
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Email
            <input
              type="email"
              name="email"
              required
              placeholder="atleta@exemplo.pt"
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
            Categoria
            <select
              name="category_id"
              required
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
            >
              <option value="">Selecionar</option>
              {(categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({Number(category.monthly_fee).toFixed(2)} EUR)
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="btn-primary h-10 rounded-lg px-5 font-semibold">
            Enviar convite
          </button>
        </form>

        {params.accountOk ? (
          <div className="mb-4 rounded-lg border border-ok/20 bg-emerald-50 p-3 text-sm text-ok">
            Conta criada com sucesso. Foi enviado um email de convite ao atleta para definir a password.
          </div>
        ) : null}

        {params.accountError ? (
          <div className="mb-4 rounded-lg border border-danger/20 bg-red-50 p-3 text-sm text-danger">
            {params.accountError}
          </div>
        ) : null}
      </section>

      <section className="surface-card mb-6 rounded-2xl p-4 md:p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Criar evento</h2>
          <p className="text-sm text-zinc-600">Define o evento, seleciona os atletas inscritos e o valor individual de cada inscricao.</p>
        </div>

        <AdminAthleteNameFilterForm athleteName={params.athleteName ?? ""} />

        <form action={createEvent} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
              Nome do evento
              <input
                type="text"
                name="event_title"
                required
                placeholder="Ex: Campeonato Regional"
                className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
              Data do evento
              <input
                type="date"
                name="event_date"
                required
                className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
              Data limite de pagamento
              <input
                type="date"
                name="payment_deadline"
                className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
              />
            </label>
          </div>

          <div className="rounded-xl border border-line/80 bg-white/70 p-4">
            <p className="sticky top-0 z-10 mb-3 border-b border-line/70 bg-white/95 pb-2 text-sm font-semibold text-zinc-800 backdrop-blur-sm">
              Atletas inscritos e valor a pagar
            </p>

            {filteredAthleteOptions.length === 0 ? (
              <p className="text-sm text-zinc-600">Sem atletas ativos para adicionar ao evento.</p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {filteredAthleteOptions.map((athlete) => (
                  <div
                    key={athlete.user_id}
                    className="grid grid-cols-1 gap-3 rounded-lg border border-line/70 bg-white p-3 md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <label className="flex items-start gap-3 text-sm text-zinc-800">
                      <input type="checkbox" name="athlete_ids" value={athlete.user_id} className="mt-1" />
                      <span>
                        <strong className="block">{athlete.full_name}</strong>
                        {athlete.email ? <span className="text-zinc-500">{athlete.email}</span> : null}
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                      Valor (EUR)
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="Ex: 12.50"
                        name={`amount_${athlete.user_id}`}
                        className="h-10 w-28 rounded-lg border border-line bg-white px-3 text-zinc-900"
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="btn-primary h-10 rounded-lg px-5 font-semibold">
            Criar evento
          </button>
        </form>
      </section>

      {params.eventOk ? (
        <div className="surface-card mb-4 rounded-lg border border-ok/20 bg-emerald-50 p-3 text-sm text-ok">
          Evento criado com sucesso.
        </div>
      ) : null}

      {params.eventError ? (
        <div className="surface-card mb-4 rounded-lg border border-danger/20 bg-red-50 p-3 text-sm text-danger">
          {params.eventError}
        </div>
      ) : null}

      <section className="surface-card sticky top-4 z-20 mb-6 rounded-2xl p-4 md:p-5 backdrop-blur-sm">
        <AdminChargesFilterAndExport
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          searchQuery={params.q ?? ""}
          paymentStatus={paymentStatus}
          selectedEventId={selectedEventId}
          events={(events ?? []).map((event) => ({ id: event.id, title: event.title }))}
          exportRows={filteredCharges.map(charge => {
            const athlete = athletesById.get(charge.athlete_user_id);
            const product = productsById.get(charge.product_id);
            return {
              id: charge.id,
              athlete: athlete?.full_name ?? '',
              email: athlete?.email ?? '',
              product: product?.name ?? '',
              amount: charge.amount,
              status: resolveChargePaymentStatus(charge),
              due_date: charge.due_date ?? ''
            };
          })}
        />
      </section>

      {selectedEvent ? (
        <section className="surface-card mb-6 rounded-2xl p-4 md:p-5">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-zinc-900">Resumo do evento</h2>
            <p className="text-sm text-zinc-600">
              {selectedEvent.title} | {new Date(selectedEvent.event_date).toLocaleDateString("pt-PT")} | Estado: {selectedEvent.status}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-line/80 bg-white/75 p-3">
              <p className="text-xs uppercase tracking-widest text-muted">Inscricoes</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{selectedEventSummary.total}</p>
            </div>
            <div className="rounded-xl border border-line/80 bg-white/75 p-3">
              <p className="text-xs uppercase tracking-widest text-muted">Pagas</p>
              <p className="mt-1 text-xl font-semibold text-ok">{selectedEventSummary.paid}</p>
            </div>
            <div className="rounded-xl border border-line/80 bg-white/75 p-3">
              <p className="text-xs uppercase tracking-widest text-muted">Por pagar</p>
              <p className="mt-1 text-xl font-semibold text-warn">{selectedEventSummary.pending}</p>
            </div>
            <div className="rounded-xl border border-line/80 bg-white/75 p-3">
              <p className="text-xs uppercase tracking-widest text-muted">Total (EUR)</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{selectedEventSummary.amount.toFixed(2)}</p>
            </div>
          </div>
        </section>
      ) : null}

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

      <section className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
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
                  <input type="hidden" name="event_id" value={selectedEventId} />

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


