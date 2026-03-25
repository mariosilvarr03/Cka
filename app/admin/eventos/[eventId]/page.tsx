import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/");
}

type EventRow = {
  id: string;
  title: string;
  event_date: string | null;
  payment_deadline: string | null;
  status: string;
};

type Registration = {
  id: string;
  athlete_user_id: string;
  status: string;
  charge_id: string | null;
  athlete_name: string;
  athlete_email: string;
  charge_amount: number | null;
  charge_status: string | null;
  paid: boolean;
};

type AthleteOption = {
  user_id: string;
  full_name: string;
  email: string | null;
};

export default async function EventEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    updateEventOk?: string;
    updateEventError?: string;
    addOk?: string;
    addError?: string;
    removeOk?: string;
    removeError?: string;
    amountOk?: string;
    amountError?: string;
  }>;
}) {
  await assertAdmin();
  const adminDb = createAdminClient();
  const { eventId } = await params;
  const sp = await searchParams;

  async function updateEventInfo(formData: FormData) {
    "use server";
    await assertAdmin();
    const adminDb = createAdminClient();

    const eventId = String(formData.get("event_id") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const eventDate = String(formData.get("event_date") ?? "").trim();
    const paymentDeadline = String(formData.get("payment_deadline") ?? "").trim();

    if (!eventId || !title || !eventDate) {
      redirect(`/admin/eventos/${eventId}?updateEventError=${encodeURIComponent("Título e data do evento são obrigatórios")}`);
    }

    const { error: eventError } = await adminDb
      .from("events")
      .update({
        title,
        event_date: eventDate,
        payment_deadline: paymentDeadline || null,
      })
      .eq("id", eventId);

    if (eventError) {
      redirect(`/admin/eventos/${eventId}?updateEventError=${encodeURIComponent("Falha ao atualizar evento")}`);
    }

    // Update due_date on pending charges via the event's product
    const { data: product } = await adminDb
      .from("products")
      .select("id")
      .eq("event_id", eventId)
      .eq("type", "event_registration")
      .maybeSingle();

    if (product) {
      const newDueDate = paymentDeadline || eventDate;
      await adminDb
        .from("charges")
        .update({ due_date: newDueDate })
        .eq("product_id", product.id)
        .eq("status", "pending");
    }

    revalidatePath(`/admin/eventos/${eventId}`);
    revalidatePath("/admin");
    redirect(`/admin/eventos/${eventId}?updateEventOk=1`);
  }

  async function addRegistration(formData: FormData) {
    "use server";
    await assertAdmin();
    const adminDb = createAdminClient();

    const eventId = String(formData.get("event_id") ?? "").trim();
    const athleteId = String(formData.get("athlete_id") ?? "").trim();
    const rawAmount = String(formData.get("amount") ?? "0").trim();
    const amount = Number(rawAmount);

    if (!eventId || !athleteId || Number.isNaN(amount) || amount < 0) {
      redirect(`/admin/eventos/${eventId}?addError=${encodeURIComponent("Dados inválidos")}`);
    }

    // Check for an existing registration (may be cancelled → reactivate)
    const { data: existingReg, error: existingRegError } = await adminDb
      .from("event_registrations")
      .select("id, status, charge_id")
      .eq("event_id", eventId)
      .eq("athlete_user_id", athleteId)
      .maybeSingle();

    if (existingRegError) {
      redirect(`/admin/eventos/${eventId}?addError=${encodeURIComponent("Erro ao verificar inscrição existente")}`);
    }

    if (existingReg && existingReg.status !== "cancelled") {
      redirect(`/admin/eventos/${eventId}?addError=already_registered`);
    }

    const { data: eventData, error: eventFetchError } = await adminDb
      .from("events")
      .select("payment_deadline, event_date")
      .eq("id", eventId)
      .single();

    if (eventFetchError || !eventData) {
      redirect(`/admin/eventos/${eventId}?addError=${encodeURIComponent("Evento não encontrado")}`);
    }

    // The event has exactly one event_registration product
    const { data: product, error: productError } = await adminDb
      .from("products")
      .select("id")
      .eq("event_id", eventId)
      .eq("type", "event_registration")
      .maybeSingle();

    if (productError || !product) {
      redirect(`/admin/eventos/${eventId}?addError=${encodeURIComponent("Produto do evento não encontrado")}`);
    }

    const dueDate = eventData.payment_deadline ?? eventData.event_date ?? null;

    const { data: charge, error: chargeError } = await adminDb
      .from("charges")
      .insert({
        athlete_user_id: athleteId,
        product_id: product.id,
        amount,
        currency: "EUR",
        due_date: dueDate,
        status: "pending",
      })
      .select("id")
      .single();

    if (chargeError || !charge) {
      redirect(`/admin/eventos/${eventId}?addError=${encodeURIComponent("Falha ao criar cobrança")}`);
    }

    if (existingReg) {
      // Reactivate the previously cancelled registration
      const { error: reactivateError } = await adminDb
        .from("event_registrations")
        .update({ status: "confirmed", charge_id: charge.id })
        .eq("id", existingReg.id);

      if (reactivateError) {
        redirect(`/admin/eventos/${eventId}?addError=${encodeURIComponent("Falha ao reativar inscrição")}`);
      }
    } else {
      const { error: insertRegError } = await adminDb
        .from("event_registrations")
        .insert({
          event_id: eventId,
          athlete_user_id: athleteId,
          charge_id: charge.id,
          status: "confirmed",
        });

      if (insertRegError) {
        redirect(`/admin/eventos/${eventId}?addError=${encodeURIComponent("Falha ao criar inscrição")}`);
      }
    }

    revalidatePath(`/admin/eventos/${eventId}`);
    revalidatePath("/admin");
    revalidatePath("/");
    redirect(`/admin/eventos/${eventId}?addOk=1`);
  }

  async function removeRegistration(formData: FormData) {
    "use server";
    await assertAdmin();
    const adminDb = createAdminClient();

    const eventId = String(formData.get("event_id") ?? "").trim();
    const registrationId = String(formData.get("registration_id") ?? "").trim();
    const chargeId = String(formData.get("charge_id") ?? "").trim();

    if (!eventId || !registrationId) {
      redirect(`/admin/eventos/${eventId}?removeError=${encodeURIComponent("Dados inválidos")}`);
    }

    if (chargeId) {
      // Cancel all non-paid payment intents (created or pending)
      await adminDb
        .from("payment_intents")
        .update({ status: "cancelled" })
        .eq("charge_id", chargeId)
        .in("status", ["created", "pending"]);

      const { error: chargeError } = await adminDb
        .from("charges")
        .update({ status: "cancelled" })
        .eq("id", chargeId)
        .neq("status", "paid");

      if (chargeError) {
        redirect(`/admin/eventos/${eventId}?removeError=${encodeURIComponent("Falha ao cancelar cobrança")}`);
      }
    }

    const { error: regError } = await adminDb
      .from("event_registrations")
      .update({ status: "cancelled" })
      .eq("id", registrationId);

    if (regError) {
      redirect(`/admin/eventos/${eventId}?removeError=${encodeURIComponent("Falha ao remover inscrição")}`);
    }

    revalidatePath(`/admin/eventos/${eventId}`);
    revalidatePath("/admin");
    revalidatePath("/");
    redirect(`/admin/eventos/${eventId}?removeOk=1`);
  }

  async function updateRegistrationAmount(formData: FormData) {
    "use server";
    await assertAdmin();
    const adminDb = createAdminClient();

    const eventId = String(formData.get("event_id") ?? "").trim();
    const chargeId = String(formData.get("charge_id") ?? "").trim();
    const rawAmount = String(formData.get("amount") ?? "").trim();
    const amount = Number(rawAmount);

    if (!eventId || !chargeId || Number.isNaN(amount) || amount < 0) {
      redirect(`/admin/eventos/${eventId}?amountError=${encodeURIComponent("Dados inválidos")}`);
    }

    // Cancel pending/created intents before updating amount to avoid stale intents
    await adminDb
      .from("payment_intents")
      .update({ status: "cancelled" })
      .eq("charge_id", chargeId)
      .in("status", ["created", "pending"]);

    const { error: chargeError } = await adminDb
      .from("charges")
      .update({ amount })
      .eq("id", chargeId)
      .eq("status", "pending");

    if (chargeError) {
      redirect(`/admin/eventos/${eventId}?amountError=${encodeURIComponent("Falha ao atualizar valor")}`);
    }

    revalidatePath(`/admin/eventos/${eventId}`);
    redirect(`/admin/eventos/${eventId}?amountOk=1`);
  }

  const [{ data: event }, { data: regRows }, { data: allAthletes }] = await Promise.all([
    adminDb
      .from("events")
      .select("id, title, event_date, payment_deadline, status")
      .eq("id", eventId)
      .maybeSingle<EventRow>(),
    adminDb
      .from("event_registrations")
      .select(
        `
          id,
          athlete_user_id,
          status,
          charge_id,
          profiles!event_registrations_athlete_user_id_fkey(full_name, email),
          charges!event_registrations_charge_id_fkey(amount, status)
        `
      )
      .eq("event_id", eventId)
      .neq("status", "cancelled"),
    adminDb
      .from("profiles")
      .select("user_id, full_name, email")
      .eq("role", "athlete")
      .eq("active", true)
      .order("full_name")
      .returns<AthleteOption[]>(),
  ]);

  if (!event) {
    redirect("/admin");
  }

  const chargeIds = (regRows ?? [])
    .map((r: any) => r.charge_id)
    .filter((id: string | null) => Boolean(id)) as string[];

  // A charge with any payment record is considered paid
  const { data: paidRows } = chargeIds.length > 0
    ? await adminDb
        .from("payments")
        .select("charge_id")
        .in("charge_id", chargeIds)
    : { data: [] as { charge_id: string }[] };

  const paidSet = new Set((paidRows ?? []).map((r) => r.charge_id));

  const registrations: Registration[] = (regRows ?? []).map((r: any) => ({
    id: r.id,
    athlete_user_id: r.athlete_user_id,
    status: r.status,
    charge_id: r.charge_id,
    athlete_name: r.profiles?.full_name ?? "—",
    athlete_email: r.profiles?.email ?? "—",
    charge_amount:
      typeof r.charges?.amount === "number" ? r.charges.amount : Number(r.charges?.amount ?? 0),
    charge_status: r.charges?.status ?? null,
    paid: r.charge_id ? paidSet.has(r.charge_id) : false,
  }));

  const registeredAthleteIds = new Set(registrations.map((r) => r.athlete_user_id));
  const availableAthletes = (allAthletes ?? []).filter(
    (athlete) => !registeredAthleteIds.has(athlete.user_id)
  );

  const totalAmount = registrations.reduce((sum, reg) => sum + (reg.charge_amount ?? 0), 0);
  const paidCount = registrations.filter((r) => r.paid).length;

  const statusBadgeClass = (status: string) => {
    if (status === "open") return "bg-emerald-100 text-emerald-800";
    if (status === "closed") return "bg-zinc-100 text-zinc-600";
    if (status === "cancelled") return "bg-rose-100 text-rose-800";
    return "bg-amber-100 text-amber-800";
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8 md:px-8 md:py-10 space-y-6">
      {/* Header */}
      <div className="surface-card rounded-2xl p-5 md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link href="/admin" className="text-sm text-brand hover:underline">
              ← Painel de administração
            </Link>
            <h1 className="section-title text-foreground">Editar evento</h1>
            <p className="muted">{event.title}</p>
          </div>
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(event.status)}`}>
            {event.status}
          </span>
        </div>
      </div>

      {/* Feedback messages */}
      {sp.updateEventOk ? (
        <div className="rounded-lg border border-ok/20 bg-emerald-50 px-4 py-3 text-sm text-ok">
          Evento atualizado com sucesso.
        </div>
      ) : null}
      {sp.updateEventError ? (
        <div className="rounded-lg border border-danger/20 bg-red-50 px-4 py-3 text-sm text-danger">
          {sp.updateEventError}
        </div>
      ) : null}
      {sp.addOk ? (
        <div className="rounded-lg border border-ok/20 bg-emerald-50 px-4 py-3 text-sm text-ok">
          Inscrição adicionada com sucesso.
        </div>
      ) : null}
      {sp.removeOk ? (
        <div className="rounded-lg border border-ok/20 bg-emerald-50 px-4 py-3 text-sm text-ok">
          Inscrição removida com sucesso.
        </div>
      ) : null}
      {sp.removeError ? (
        <div className="rounded-lg border border-danger/20 bg-red-50 px-4 py-3 text-sm text-danger">
          {sp.removeError}
        </div>
      ) : null}
      {sp.amountOk ? (
        <div className="rounded-lg border border-ok/20 bg-emerald-50 px-4 py-3 text-sm text-ok">
          Valor atualizado com sucesso.
        </div>
      ) : null}
      {sp.addError ? (
        <div className="rounded-lg border border-danger/20 bg-red-50 px-4 py-3 text-sm text-danger">
          {sp.addError === "already_registered"
            ? "Este atleta já se encontra inscrito neste evento."
            : sp.addError}
        </div>
      ) : null}
      {sp.amountError ? (
        <div className="rounded-lg border border-danger/20 bg-red-50 px-4 py-3 text-sm text-danger">
          {sp.amountError}
        </div>
      ) : null}

      {/* Event info form */}
      <section className="surface-card rounded-2xl p-5 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">Dados do evento</h2>
        <form action={updateEventInfo} className="grid gap-4 md:grid-cols-3">
          <input type="hidden" name="event_id" value={event.id} />
          <div className="md:col-span-3">
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">
              Título
              <input
                name="title"
                defaultValue={event.title}
                required
                className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">
            Data do evento
            <input
              type="date"
              name="event_date"
              defaultValue={event.event_date ? event.event_date.slice(0, 10) : ""}
              required
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">
            Prazo pagamento
            <input
              type="date"
              name="payment_deadline"
              defaultValue={event.payment_deadline ? event.payment_deadline.slice(0, 10) : ""}
              className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary h-10 rounded-lg px-5 font-semibold">
              Guardar alterações
            </button>
          </div>
        </form>
      </section>

      {/* Summary stats */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="surface-card rounded-2xl p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Inscrições</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{registrations.length}</p>
        </div>
        <div className="surface-card rounded-2xl p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Pagas</p>
          <p className="mt-1 text-2xl font-semibold text-ok">
            {paidCount} / {registrations.length}
          </p>
        </div>
        <div className="surface-card rounded-2xl p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Total</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{totalAmount.toFixed(2)} €</p>
        </div>
      </section>

      {/* Add registration */}
      <section className="surface-card rounded-2xl p-5 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">Adicionar inscrição</h2>
        {availableAthletes.length === 0 ? (
          <p className="text-sm text-zinc-600">Não há atletas disponíveis para adicionar.</p>
        ) : (
          <form action={addRegistration} className="grid gap-4 md:grid-cols-3">
            <input type="hidden" name="event_id" value={event.id} />
            <div className="md:col-span-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">
                Atleta
                <select
                  name="athlete_id"
                  required
                  defaultValue=""
                  className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
                >
                  <option value="" disabled>Selecionar atleta</option>
                  {availableAthletes.map((athlete) => (
                    <option key={athlete.user_id} value={athlete.user_id}>
                      {athlete.full_name}{athlete.email ? ` (${athlete.email})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">
              Valor (€)
              <input
                type="number"
                name="amount"
                min="0"
                step="0.01"
                required
                defaultValue="0"
                className="h-10 rounded-lg border border-line bg-white px-3 text-zinc-900"
              />
            </label>
            <div className="md:col-span-3">
              <button type="submit" className="btn-primary h-10 rounded-lg px-5 font-semibold">
                Adicionar inscrição
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Registrations list */}
      <section className="surface-card rounded-2xl p-5 md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">Inscrições atuais</h2>
        {registrations.length === 0 ? (
          <p className="text-sm text-zinc-600">Ainda não existem inscrições neste evento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-zinc-700">
              <thead>
                <tr className="border-b border-line/70 text-left text-xs uppercase tracking-wider text-muted">
                  <th className="pb-2 pr-4 font-semibold">Atleta</th>
                  <th className="pb-2 pr-4 font-semibold">Email</th>
                  <th className="pb-2 pr-4 font-semibold">Estado</th>
                  <th className="pb-2 pr-4 font-semibold">Valor</th>
                  <th className="pb-2 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {registrations.map((reg) => (
                  <tr key={reg.id} className="hover:bg-white/50">
                    <td className="py-3 pr-4 font-medium text-zinc-900">{reg.athlete_name}</td>
                    <td className="py-3 pr-4 text-zinc-600">{reg.athlete_email}</td>
                    <td className="py-3 pr-4">
                      {reg.paid ? (
                        <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          Pago
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {reg.charge_id && !reg.paid ? (
                        <form action={updateRegistrationAmount} className="flex items-center gap-2">
                          <input type="hidden" name="event_id" value={event.id} />
                          <input type="hidden" name="charge_id" value={reg.charge_id} />
                          <input
                            type="number"
                            name="amount"
                            min="0"
                            step="0.01"
                            defaultValue={reg.charge_amount ?? 0}
                            className="h-9 w-28 rounded-lg border border-line bg-white px-2 text-sm text-zinc-900"
                          />
                          <button
                            type="submit"
                            className="btn-ghost h-9 rounded-lg px-3 text-xs font-semibold uppercase tracking-[0.14em]"
                          >
                            Atualizar
                          </button>
                        </form>
                      ) : (
                        <span>{(reg.charge_amount ?? 0).toFixed(2)} €</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {!reg.paid ? (
                        <form action={removeRegistration}>
                          <input type="hidden" name="event_id" value={event.id} />
                          <input type="hidden" name="registration_id" value={reg.id} />
                          <input type="hidden" name="charge_id" value={reg.charge_id ?? ""} />
                          <button
                            type="submit"
                            className="inline-flex h-8 items-center rounded-lg border border-danger/20 px-3 text-xs font-semibold text-danger hover:bg-red-50"
                          >
                            Remover
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
