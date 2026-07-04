# Somnia Vercel Deployment

This file is the launch checklist for putting Somnia Alpha online with a temporary Vercel URL first, then binding `joinsomnia.app`.

## Recommended First Launch

Use Vercel first and keep the project on Base Sepolia until the publish flow is tested end to end.

1. Push the project to a private GitHub repository.
2. Import the repository into Vercel as a Next.js app.
3. Set the project root to this folder if the repository contains other work:
   `outputs/somnia-alpha`
4. Use the default commands:
   - Install: `pnpm install`
   - Build: `pnpm build`
   - Output: Next.js default
5. Add the environment variables below.
6. Deploy and test the free Vercel URL before binding a paid domain.

## Environment Variables

Add these in Vercel Project Settings > Environment Variables.

Public browser variables:

```text
NEXT_PUBLIC_CHAIN=baseSepolia
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_SOMNIA_CONTRACT=
NEXT_PUBLIC_SOMNIA_DEPLOY_BLOCK=
NEXT_PUBLIC_USDC_ADDRESS=
```

Server-only variables:

```text
PINATA_JWT=
```

Do not add `DEPLOYER_PRIVATE_KEY` to Vercel for normal app hosting. Vercel only needs the browser variables above and `PINATA_JWT`.

Deployment-only variables for local contract deployment:

```text
DEPLOYER_PRIVATE_KEY=
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
SOMNIA_TREASURY=
SOMNIA_DREAM_VAULT=
SOMNIA_REVIEWER_REWARDS=
```

## Domain Plan

Recommended domain direction:

- Primary domain: `joinsomnia.app`

After buying a domain:

1. Open the Vercel project.
2. Go to Settings > Domains.
3. Add `joinsomnia.app`.
4. Add `www.joinsomnia.app` if you want the `www` address to work too.
4. Follow the DNS records shown by Vercel exactly at the domain registrar.
5. After the domain is verified, add it to WalletConnect Cloud allowed domains if that project setting is enabled.

## Security Rules

- Never upload `.env.local`.
- Never paste the deployer private key into the frontend code.
- Rotate the Pinata JWT or deployer wallet if either one has been shared publicly.
- Keep Base Sepolia for public testing. Move to Base mainnet only after contract review and legal wording are ready.

## Smoke Test After Deploy

1. Open the deployed URL.
2. Switch wallet to Base Sepolia.
3. Connect wallet through RainbowKit.
4. Confirm the page shows the deployed Somnia contract address.
5. Publish one test Dream with Base Sepolia test USDC.
6. Publish one featured test Dream with 100 test USDC.
7. Confirm both transactions on Base Sepolia explorer.
8. Confirm IPFS metadata opens through the stored URI.
9. Confirm featured Dreams appear in the homepage carousel and all Dreams show a 3-day expiry.
