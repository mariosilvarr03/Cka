import { createClient } from "@/lib/supabase/server";
import InviteAcceptHandler from "./InviteAcceptHandler";
import { redirect } from "next/navigation";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    resetError?: string;
    resetOk?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  async function signIn(formData: FormData) {
    "use server";

    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();

    if (!email || !password) {
      redirect("/login?error=Preenche+email+e+password");
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      redirect("/login?error=Credenciais+invalidas");
    }

    redirect("/");
  }

  async function requestPasswordReset(formData: FormData) {
    "use server";

    const email = String(formData.get("reset_email") ?? "").trim().toLowerCase();

    if (!email) {
      redirect("/login?resetError=Indica+um+email+valido");
    }

    const supabase = await createClient();
    const appBaseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      ...(appBaseUrl ? { redirectTo: `${appBaseUrl}/login` } : {}),
    });

    if (error) {
      redirect("/login?resetError=Nao+foi+possivel+enviar+o+email+de+recuperacao");
    }

    redirect("/login?resetOk=1");
  }

  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-5 py-10 md:px-8">
      <div className="surface-card grid overflow-hidden rounded-2xl md:grid-cols-[1.1fr_1fr]">
        <section className="bg-gradient-to-br from-brand/95 to-brand-2/95 p-7 text-white md:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-100">Karate Club</p>
          <h1 className="mt-2 text-4xl font-bold leading-tight">Portal de Pagamentos</h1>
          <p className="mt-4 max-w-md text-sm text-orange-50/90">
            Gerir mensalidades, acompanhar estados de pagamento e manter o historico financeiro dos atletas num unico lugar.
          </p>

          <div className="mt-8 grid gap-3 text-sm">
            <div className="rounded-xl border border-white/30 bg-white/10 p-3">Acesso rapido para atletas e administracao</div>
            <div className="rounded-xl border border-white/30 bg-white/10 p-3">Controlo mensal com estados pago e por pagar</div>
            <div className="rounded-xl border border-white/30 bg-white/10 p-3">Base pronta para adicionar eventos e inscricoes</div>
          </div>
        </section>

        <section className="p-6 md:p-8">
          <h2 className="mb-1 text-2xl font-bold text-zinc-900">Entrar</h2>
          <p className="mb-6 text-sm text-zinc-600">Usa o teu email e password para continuar.</p>

          <InviteAcceptHandler />

          {params.error ? (
            <p className="mb-4 rounded-lg border border-danger/20 bg-red-50 p-3 text-sm text-danger">
              {params.error}
            </p>
          ) : null}

          {params.resetError ? (
            <p className="mb-4 rounded-lg border border-danger/20 bg-red-50 p-3 text-sm text-danger">
              {params.resetError}
            </p>
          ) : null}

          {params.resetOk ? (
            <p className="mb-4 rounded-lg border border-ok/20 bg-emerald-50 p-3 text-sm text-ok">
              Enviamos um email com instrucoes para definires uma nova palavra-passe.
            </p>
          ) : null}

          <form action={signIn} className="space-y-4">
            <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
              Email
              <input
                type="email"
                name="email"
                required
                className="h-11 rounded-lg border border-line bg-white px-3 text-zinc-900"
                placeholder="teuemail@exemplo.com"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
              Password
              <input
                type="password"
                name="password"
                required
                className="h-11 rounded-lg border border-line bg-white px-3 text-zinc-900"
                placeholder="********"
              />
            </label>

            <button type="submit" className="btn-primary h-11 w-full rounded-lg font-semibold">
              Entrar
            </button>
          </form>

          <div className="my-5 border-t border-line/70" />

          <form action={requestPasswordReset} className="space-y-3">
            <p className="text-sm font-semibold text-zinc-800">Nao consegues entrar?</p>
            <p className="text-sm text-zinc-600">Pede um email para definir ou recuperar a palavra-passe.</p>
            <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-700">
              Email para recuperar acesso
              <input
                type="email"
                name="reset_email"
                required
                className="h-11 rounded-lg border border-line bg-white px-3 text-zinc-900"
                placeholder="teuemail@exemplo.com"
              />
            </label>
            <button type="submit" className="btn-ghost h-11 w-full rounded-lg font-semibold">
              Enviar email de recuperacao
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

