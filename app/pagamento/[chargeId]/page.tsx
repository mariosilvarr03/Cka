import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PaymentMethodForm from "./PaymentMethodForm";

type PageProps = {
  params: Promise<{ chargeId: string }>;
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

export default async function PaymentPage({ params }: PageProps) {
  const { chargeId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: charge } = await supabase
    .from("charges")
    .select("id, athlete_user_id, product_id, amount, status, due_date, billing_month, billing_year")
    .eq("id", chargeId)
    .eq("athlete_user_id", user.id)
    .maybeSingle<Charge>();

  if (!charge) {
    notFound();
  }

  const { data: product } = await supabase
    .from("products")
    .select("id, name, type")
    .eq("id", charge.product_id)
    .maybeSingle<Product>();

  const alreadyPaid = charge.status === "paid";

  const paymentsProviderMode = process.env.PAYMENTS_PROVIDER_MODE || "mock";
  const pagamentosIndisponiveis = paymentsProviderMode === "mock";

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
      <header className="surface-card mb-5 rounded-2xl p-4 sm:p-5 md:mb-6 md:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Pagamento</p>
        <h1 className="section-title text-foreground">Pagar mensalidade</h1>
        <p className="muted mt-2">Escolhe o metodo de pagamento para concluir esta cobranca.</p>
      </header>

      <section className="surface-card rounded-2xl p-4 sm:p-5 md:p-6">
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-line/80 bg-white/75 p-4 text-sm text-zinc-700 md:mb-5 md:grid-cols-2">
          <p>
            <strong>Produto:</strong> {product?.name ?? "Mensalidade"}
          </p>
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

        {pagamentosIndisponiveis && (
          <div className="rounded-lg border border-warning/20 bg-yellow-50 p-4 text-warning mb-4">
            Os pagamentos estão temporariamente indisponíveis enquanto aguardamos aprovação do parceiro de pagamentos. Podes voltar mais tarde para concluir o pagamento.
          </div>
        )}

        {alreadyPaid ? (
          <div className="rounded-lg border border-ok/20 bg-emerald-50 p-4 text-ok">
            Esta cobranca ja esta paga.
          </div>
        ) : (
          <PaymentMethodForm chargeId={charge.id} amount={charge.amount} />
        )}

        <div className="mt-5">
          <Link
            href="/"
            scroll={false}
            className="btn-ghost inline-flex h-11 w-full items-center justify-center rounded-lg px-4 font-medium hover:bg-white sm:h-10 sm:w-auto"
          >
            Voltar para mensalidades
          </Link>
        </div>
      </section>
    </main>
  );
}

