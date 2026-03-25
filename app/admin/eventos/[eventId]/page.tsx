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

export default async function EventEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    updateEventOk?: string;
    addOk?: string;
    addError?: string;
    removeOk?: string;
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

    const eventId = String(formData.get("event_id") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    const eventDate = String(formData.get("event_date") ?? "").trim();
    const paymentDeadline = String(formData.get("payment_deadline") ?? "").trim();

    if (!eventId || !title) {
      redirect(`/admin/eventos/${eventId}?amountError=invalid`);
    }

    const { error: eventError } = await adminDb
      .from("events")
      .update({
        title,
        event_date: eventDate || null,
        payment_deadline: paymentDeadline || null,
      })
      .eq("id", eventId);

    if (eventError) {
      redirect(`/admin/eventos/${eventId}?amountError=invalid`);
    }

    const { error: chargeUpdateError } = await adminDb
      .from("charges")
      .update({ due_date: paymentDeadline || null })
      .eq("event_id", eventId)
      .in("status", ["pending", "created"]);

    if (chargeUpdateError) {
      redirect(`/admin/eventos/${eventId}?amountError=invalid`);
    }

    revalidatePath(`/admin/eventos/${eventId}`);
    revalidatePath("/admin");
    redirect(`/admin/eventos/${eventId}?updateEventOk=1`);
  }

  async function addRegistration(formData: FormData) {
    "use server";
    await assertAdmin();
    const adminDb = createAdminClient();

    const eventId = String(formData.get("event_id") ?? "");
    const athleteId = String(formData.get("athlete_id") ?? "");
    const amount = Number(formData.get("amount"));

    if (!eventId || !athleteId || Number.isNaN(amount) || amount < 0) {
      redirect(`/admin/eventos/${eventId}?addError=invalid`);
    }

    const { data: existingReg, error: existingRegError } = await adminDb
      .from("event_registrations")
      .select("id, status")
      .eq("event_id", eventId)
      .eq("athlete_user_id", athleteId)
      .maybeSingle();

    if (existingRegError) {
      redirect(`/admin/eventos/${eventId}?addError=invalid`);
    }

    if (existingReg && existingReg.status !== "cancelled") {
      redirect(`/admin/eventos/${eventId}?addError=already_registered`);
    }

    const { data: eventData, error: eventError } = await adminDb
      .from("events")
      .select("title, payment_deadline")
      .eq("id", eventId)
      .single();

    if (eventError || !eventData) {
      redirect(`/admin/eventos/${eventId}?addError=invalid`);
    }

    const { data: charge, error: chargeError } = await adminDb
      .from("charges")
      .insert({
        user_id: athleteId,
        event_id: eventId,
        amount,
        status: "pending",
        description: `Inscrição no evento: ${eventData.title}`,
        due_date: eventData.payment_deadline ?? null,
      })
      .select("id")
      .single();

    if (chargeError || !charge) {
      redirect(`/admin/eventos/${eventId}?addError=charge_failed`);
    }

    if (existingReg) {
      const { error: reactivateError } = await adminDb
        .from("event_registrations")
        .update({
          status: "confirmed",
          charge_id: charge.id,
        })
        .eq("id", existingReg.id);

      if (reactivateError) {
        redirect(`/admin/eventos/${eventId}?addError=invalid`);
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
        redirect(`/admin/eventos/${eventId}?addError=invalid`);
      }
    }

    revalidatePath(`/admin/eventos/${eventId}`);
    redirect(`/admin/eventos/${eventId}?addOk=1`);
  }

  async function removeRegistration(formData: FormData) {
    "use server";
    await assertAdmin();
    const adminDb = createAdminClient();

    const eventId = String(formData.get("event_id") ?? "");
    const registrationId = String(formData.get("registration_id") ?? "");
    const chargeId = String(formData.get("charge_id") ?? "");

    if (!eventId || !registrationId) {
      redirect(`/admin/eventos/${eventId}?amountError=invalid`);
    }

    if (chargeId) {
      const { error: intentError } = await adminDb
        .from("payment_intents")
        .update({ status: "cancelled" })
        .eq("charge_id", chargeId)
        .eq("status", "created");

      if (intentError) {
        redirect(`/admin/eventos/${eventId}?amountError=invalid`);
      }

      const { error: chargeError } = await adminDb
        .from("charges")
        .update({ status: "cancelled" })
        .eq("id", chargeId)
        .neq("status", "paid");

      if (chargeError) {
        redirect(`/admin/eventos/${eventId}?amountError=invalid`);
      }
    }

    const { error: regError } = await adminDb
      .from("event_registrations")
      .update({ status: "cancelled" })
      .eq("id", registrationId);

    if (regError) {
      redirect(`/admin/eventos/${eventId}?amountError=invalid`);
    }

    revalidatePath(`/admin/eventos/${eventId}`);
    redirect(`/admin/eventos/${eventId}?removeOk=1`);
  }

  async function updateRegistrationAmount(formData: FormData) {
    "use server";
    await assertAdmin();
    const adminDb = createAdminClient();

    const eventId = String(formData.get("event_id") ?? "");
    const chargeId = String(formData.get("charge_id") ?? "");
    const amount = Number(formData.get("amount"));

    if (!eventId || !chargeId || Number.isNaN(amount) || amount < 0) {
      redirect(`/admin/eventos/${eventId}?amountError=invalid`);
    }

    const { error: intentError } = await adminDb
      .from("payment_intents")
      .update({ status: "cancelled" })
      .eq("charge_id", chargeId)
      .eq("status", "created");

    if (intentError) {
      redirect(`/admin/eventos/${eventId}?amountError=invalid`);
    }

    const { error: chargeError } = await adminDb
      .from("charges")
      .update({ amount })
      .eq("id", chargeId)
      .eq("status", "pending");

    if (chargeError) {
      redirect(`/admin/eventos/${eventId}?amountError=invalid`);
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
      .select("id, full_name, email")
      .eq("role", "athlete")
      .order("full_name"),
  ]);

  if (!event) {
    redirect("/admin");
  }

  const chargeIds = (regRows ?? [])
    .map((r: any) => r.charge_id)
    .filter((id: string | null) => Boolean(id));

  const { data: paidRows } =
    chargeIds.length > 0
      ? await adminDb
          .from("payments")
          .select("charge_id")
          .in("charge_id", chargeIds)
          .eq("status", "completed")
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
    (athlete) => !registeredAthleteIds.has(athlete.id)
  );

  const totalAmount = registrations.reduce((sum, reg) => sum + (reg.charge_amount ?? 0), 0);
  const paidCount = registrations.filter((r) => r.paid).length;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-blue-600 hover:underline">
            ← Voltar ao admin
          </Link>
          <h1 className="text-2xl font-bold mt-2">Editar evento</h1>
          <p className="text-sm text-gray-600">{event.title}</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          Estado: {event.status}
        </span>
      </div>

      {sp.updateEventOk && (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Evento atualizado com sucesso.
        </p>
      )}
      {sp.addOk && (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Inscrição adicionada com sucesso.
        </p>
      )}
      {sp.removeOk && (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Inscrição removida com sucesso.
        </p>
      )}
      {sp.amountOk && (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Valor atualizado com sucesso.
        </p>
      )}
      {(sp.addError || sp.amountError) && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Ocorreu um erro ao processar a operação.
        </p>
      )}

      <section className="rounded-lg border bg-white p-4 space-y-4">
        <h2 className="text-lg font-semibold">Dados do evento</h2>
        <form action={updateEventInfo} className="grid gap-4 md:grid-cols-3">
          <input type="hidden" name="event_id" value={event.id} />
          <div className="md:col-span-3">
            <label className="block text-sm font-medium mb-1">Título</label>
            <input
              name="title"
              defaultValue={event.title}
              className="w-full rounded border px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Data do evento</label>
            <input
              type="date"
              name="event_date"
              defaultValue={event.event_date ? event.event_date.slice(0, 10) : ""}
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Prazo pagamento</label>
            <input
              type="date"
              name="payment_deadline"
              defaultValue={event.payment_deadline ? event.payment_deadline.slice(0, 10) : ""}
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Guardar alterações
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Inscrições</p>
          <p className="text-2xl font-semibold">{registrations.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Pagas</p>
          <p className="text-2xl font-semibold">
            {paidCount} / {registrations.length}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Total</p>
          <p className="text-2xl font-semibold">{totalAmount.toFixed(2)} €</p>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 space-y-4">
        <h2 className="text-lg font-semibold">Adicionar inscrição</h2>
        {availableAthletes.length === 0 ? (
          <p className="text-sm text-gray-600">Não há atletas disponíveis para adicionar.</p>
        ) : (
          <form action={addRegistration} className="grid gap-4 md:grid-cols-3">
            <input type="hidden" name="event_id" value={event.id} />
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Atleta</label>
              <select
                name="athlete_id"
                required
                className="w-full rounded border px-3 py-2 text-sm bg-white"
                defaultValue=""
              >
                <option value="" disabled>
                  Selecionar atleta
                </option>
                {availableAthletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.full_name} ({athlete.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Valor (€)</label>
              <input
                type="number"
                name="amount"
                min="0"
                step="0.01"
                required
                defaultValue="0"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-3">
              <button className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                Adicionar inscrição
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-semibold mb-4">Inscrições atuais</h2>
        {registrations.length === 0 ? (
          <p className="text-sm text-gray-600">Ainda não existem inscrições neste evento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Atleta</th>
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Estado</th>
                  <th className="pb-2 font-medium">Valor</th>
                  <th className="pb-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((reg) => (
                  <tr key={reg.id} className="border-b last:border-0">
                    <td className="py-3">{reg.athlete_name}</td>
                    <td className="py-3 text-gray-600">{reg.athlete_email}</td>
                    <td className="py-3">
                      {reg.paid ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          Pago
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="py-3">
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
                            className="w-28 rounded border px-2 py-1"
                          />
                          <button className="rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-black">
                            Atualizar
                          </button>
                        </form>
                      ) : (
                        <span>{(reg.charge_amount ?? 0).toFixed(2)} €</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end">
                        {!reg.paid && (
                          <form action={removeRegistration}>
                            <input type="hidden" name="event_id" value={event.id} />
                            <input type="hidden" name="registration_id" value={reg.id} />
                            <input type="hidden" name="charge_id" value={reg.charge_id ?? ""} />
                            <button className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                              Remover
                            </button>
                          </form>
                        )}
                      </div>
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
