import { legalInfo } from "@/lib/legal";

export const metadata = {
  title: "Politica de privacidade",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10">
      <article className="surface-card rounded-2xl p-5 sm:p-6 md:p-8">
        <h1 className="section-title text-foreground">Politica de privacidade</h1>
        <p className="muted mt-2">
          Esta politica explica como tratamos dados pessoais no portal de pagamentos, em
          conformidade com o RGPD.
        </p>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">1. Responsavel pelo tratamento</h2>
          <p>
            <strong>Entidade:</strong> {legalInfo.sellerName}
          </p>
          <p>
            <strong>Morada:</strong> {legalInfo.sellerAddress}
          </p>
          <p>
            <strong>Email:</strong> {legalInfo.sellerEmail}
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">2. Dados recolhidos</h2>
          <p>
            Podemos recolher dados de identificacao e contacto (nome, email), dados de autenticacao,
            dados de cobranca e pagamento (valor, estado, referencias), e dados tecnicos essenciais
            para seguranca e funcionamento da plataforma.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">3. Finalidades e base juridica</h2>
          <p>
            Tratamos os dados para gerir contas de utilizador, emitir e cobrar mensalidades/inscricoes,
            cumprir obrigacoes legais e responder a pedidos de suporte.
          </p>
          <p>
            Bases juridicas: execucao de contrato, cumprimento de obrigacao legal e interesse legitimo
            na seguranca e boa gestao do servico.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">4. Partilha com terceiros</h2>
          <p>
            Partilhamos dados apenas quando necessario com prestadores de servicos para operacao da
            plataforma, incluindo:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Supabase (infraestrutura de base de dados e autenticacao)</li>
            <li>EasyPay (processamento de pagamentos)</li>
          </ul>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">5. Prazo de conservacao</h2>
          <p>
            Os dados sao conservados pelo periodo necessario para as finalidades acima e para cumprir
            obrigacoes legais, nomeadamente fiscais e contabilisticas.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">6. Direitos dos titulares</h2>
          <p>
            Podes solicitar acesso, retificacao, apagamento, limitacao, oposicao e portabilidade dos
            teus dados, nos termos legais. Para exercer estes direitos, contacta {legalInfo.supportEmail}.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">7. Transferencias internacionais</h2>
          <p>
            Quando existam transferencias para fora do Espaco Economico Europeu, sao aplicadas as
            garantias legais adequadas previstas no RGPD.
          </p>
        </section>

        <section className="mt-6 space-y-2 text-sm text-zinc-700">
          <h2 className="text-base font-semibold text-zinc-900">8. Contacto e reclamacoes</h2>
          <p>
            Para questoes de privacidade: {legalInfo.supportEmail}
            {legalInfo.supportPhone ? ` | ${legalInfo.supportPhone}` : ""}
          </p>
          <p>
            Tambem podes apresentar reclamacao junto da autoridade de controlo competente (em Portugal,
            a CNPD).
          </p>
        </section>
      </article>
    </main>
  );
}
