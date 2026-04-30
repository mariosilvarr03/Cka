import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-5 sm:px-5 sm:py-8 md:px-8 md:py-10">
      <header className="surface-card mb-5 rounded-xl p-4 sm:mb-6 sm:rounded-2xl sm:p-5 md:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Conta</p>
        <h1 className="section-title text-foreground">Seguranca da conta</h1>
        <p className="muted mt-2">Atualiza a tua palavra-passe sempre que precisares.</p>
      </header>

      <section className="surface-card rounded-xl p-4 sm:rounded-2xl sm:p-5 md:p-6">
        <p className="mb-4 text-sm text-zinc-600">Conta: {user.email}</p>
        <ChangePasswordForm />

        <div className="mt-5">
          <Link
            href="/"
            scroll={false}
            className="btn-ghost inline-flex h-10 items-center rounded-lg px-4 font-medium hover:bg-white"
          >
            Voltar ao portal
          </Link>
        </div>
      </section>
    </main>
  );
}
