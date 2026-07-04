# Somnia Alpha

**Somnia - Where dreams become buildable.**

This is the formal Alpha foundation for Somnia: a wallet-first, onchain Dream publishing platform with time-limited listings, homepage spotlight placement, and transparent 50 / 30 / 20 fee allocation.

## V1 Product Rules

- A standard Dream Plaza listing costs 10 USDC and stays visible for 3 days.
- A homepage spotlight listing costs 100 USDC and rotates in the featured carousel for 3 days.
- The points system is reserved for V2 after the publish and placement flow is stable.
- 50 percent goes to Somnia Treasury.
- 30 percent goes to Dream Vault.
- 20 percent goes to Reviewer Rewards.
- Signals are community support, not investments.
- Publishing does not create equity, yield, revenue share, token upside, or guaranteed funding.

## Stack

- Next.js App Router
- TypeScript
- RainbowKit + wagmi + viem
- Solidity contract
- Pinata-compatible IPFS API route

## Setup

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

For local UI testing, the app can run without a deployed contract. Publishing will stop at the wallet/payment boundary until `NEXT_PUBLIC_SOMNIA_CONTRACT`, `NEXT_PUBLIC_USDC_ADDRESS`, and `PINATA_JWT` are configured.

## Main Files

- `src/app/page.tsx`: Main Somnia Alpha product surface
- `src/app/providers.tsx`: Wallet and chain providers
- `src/app/api/ipfs/route.ts`: IPFS JSON upload route
- `src/lib/somniaAbi.ts`: Frontend ABI
- `contracts/SomniaDreamRegistry.sol`: Contract source
- `scripts/deploy.ts`: Base Sepolia deployment scaffold

## Recommended Launch Order

1. Deploy to Base Sepolia.
2. Connect Pinata or another IPFS pinning provider.
3. Test both 10 USDC standard publish and 100 USDC featured publish with test USDC.
4. Add event indexing for Dream Plaza.
5. Audit the contract before real funds.
6. Deploy to Base mainnet only after legal review.

See `BASE_SEPOLIA_DEPLOYMENT.md` for the detailed testnet deployment flow.
See `VERCEL_DEPLOYMENT.md` for the Vercel, environment variable, and custom domain checklist.
