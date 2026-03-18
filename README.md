This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Payments (Easypay)

This project supports two payment provider modes:

- `mock` (default): local simulated responses
- `real`: Easypay API (`/single` + webhook verification)

Set these environment variables in `.env.local`:

```bash
PAYMENTS_PROVIDER_MODE=real
PAYMENTS_PROVIDER_BASE_URL=https://api.test.easypay.pt/2.0
PAYMENTS_PROVIDER_ACCOUNT_ID=<your_account_id>
PAYMENTS_PROVIDER_API_KEY=<your_api_key>

# Optional extra protection for webhook endpoint (custom shared secret)
PAYMENTS_WEBHOOK_SECRET=<optional_custom_secret>

# Optional signature verification for providers that sign payload body
PAYMENTS_WEBHOOK_SIGNATURE_SECRET=<optional_signature_secret>
```

Notes:

- When `PAYMENTS_PROVIDER_MODE=real`, create-intent calls Easypay `POST /single` with `Idempotency-Key`.
- The webhook endpoint accepts Easypay notification payloads and validates status by calling Easypay `GET /single/{id}`.
- If `PAYMENTS_WEBHOOK_SECRET` is configured, incoming webhook requests must include `x-webhook-secret` with the same value.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
