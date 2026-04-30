import Link from "next/link";
import ChangePasswordForm from "@/app/conta/ChangePasswordForm";

export default function SetPasswordPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-4 sm:px-5 sm:py-8 md:px-8 md:py-10">
      <header className="surface-card mb-4 rounded-xl p-3.5 sm:mb-5 sm:rounded-2xl sm:p-5 md:mb-6 md:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Convite</p>
        <h1 className="section-title text-foreground">Definir palavra-passe</h1>
        <p className="muted mt-2">Escolhe uma palavra-passe para ativar a tua conta.</p>
      </header>

      <section className="surface-card rounded-xl p-3.5 sm:rounded-2xl sm:p-5 md:p-6">
        <ChangePasswordForm />

        <div className="mt-5">
          <Link
            href="/"
            scroll={false}
            className="btn-ghost inline-flex h-11 w-full items-center justify-center rounded-lg px-4 font-medium hover:bg-white sm:h-10 sm:w-auto"
          >
            Ir para o portal
          </Link>
        </div>
      </section>
    </main>
  );
}

