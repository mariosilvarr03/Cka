export const legalInfo = {
  sellerName: process.env.NEXT_PUBLIC_LEGAL_SELLER_NAME ?? "Karate Club",
  sellerAddress: process.env.NEXT_PUBLIC_LEGAL_SELLER_ADDRESS ?? "Morada por definir",
  sellerEmail: process.env.NEXT_PUBLIC_LEGAL_SELLER_EMAIL ?? "geral@example.com",
  sellerNif: process.env.NEXT_PUBLIC_LEGAL_SELLER_NIF ?? "NIF por definir",
  acceptedPayments:
    process.env.NEXT_PUBLIC_LEGAL_ACCEPTED_PAYMENTS ?? "Multibanco, MB WAY e cartao",
  supportEmail: process.env.NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL ?? "geral@example.com",
  supportPhone: process.env.NEXT_PUBLIC_LEGAL_SUPPORT_PHONE ?? "Telefone por definir",
};
