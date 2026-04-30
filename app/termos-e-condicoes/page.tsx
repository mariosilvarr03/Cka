import Link from "next/link";
import { legalInfo } from "@/lib/legal";

export const metadata = {
  title: "Termos e condicoes",
};

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10">
      <article className="surface-card rounded-2xl p-5 sm:p-6 md:p-8">
        <h1 className="section-title text-foreground">Termos e condicoes</h1>
        <p className="muted mt-2">
          Estes termos regulam a utilizacao do portal de pagamentos para mensalidades e inscricoes em
          eventos do clube.
        </p>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">1. Identificacao do vendedor</h2>
          <p>
            <strong>Nome:</strong> {legalInfo.sellerName}
          </p>
          <p>
            <strong>Morada:</strong> {legalInfo.sellerAddress}
          </p>
          <p>
            <strong>Email:</strong> {legalInfo.sellerEmail}
          </p>
          <p>
            <strong>NIF:</strong> {legalInfo.sellerNif}
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">2. Servicos</h2>
          <p>
            O portal permite pagar mensalidades e inscricoes em eventos organizados pelo clube,
            incluindo cobrancas pontuais associadas a atividades desportivas.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">3. Precos e pagamento</h2>
          <p>Todos os precos apresentados incluem os impostos legalmente aplicaveis.</p>
          <p>
            Metodos de pagamento aceites: {legalInfo.acceptedPayments}. Nao existem custos de envio
            por se tratar de servicos digitais.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">
            4. Direito de livre resolucao (quando aplicavel)
          </h2>
          <p>
            O consumidor pode exercer o direito de livre resolucao no prazo de 14 dias, quando
            legalmente aplicavel. O pedido deve ser enviado para {legalInfo.supportEmail}.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">5. Prestacao do servico</h2>
          <p>
            A ativacao da mensalidade ou inscricao e processada apos confirmacao do pagamento. Na
            ausencia de prazo especifico, aplica-se o limite legal maximo de 30 dias.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">6. Garantia legal</h2>
          <p>
            Mantem-se a garantia legal de conformidade prevista na legislacao da UE, quando aplicavel.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">
            7. Resolucao alternativa de litigios
          </h2>
          <p>
            Em caso de litigio, o consumidor pode recorrer a uma entidade de RAL e a plataforma de
            Resolucao de Litigios em Linha (RLL):
          </p>
          <p>
            <Link
              href="https://ec.europa.eu/consumers/odr"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline decoration-2 underline-offset-4 hover:text-brand-2"
            >
              https://ec.europa.eu/consumers/odr
            </Link>
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">8. Contactos</h2>
          <p>
            Para qualquer questao relacionada com estes termos: {legalInfo.supportEmail}
            {legalInfo.supportPhone ? ` | ${legalInfo.supportPhone}` : ""}
          </p>
        </section>
      </article>
    </main>
  );
}
