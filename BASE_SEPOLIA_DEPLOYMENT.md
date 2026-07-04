# Somnia Base Sepolia Deployment Guide

This guide prepares Somnia Alpha for a real testnet publish flow:

Wallet connect -> IPFS upload -> USDC approval -> `publishDreamWithPlacement` -> onchain Dream event.

## Current Testnet Contract

- Network: Base Sepolia
- Deployed on: 2026-07-04
- Contract: `SomniaDreamRegistry`
- Address: `0x0275875af4d50257fa9ba5cc916d1951fe0b6eae`
- Event scan start block: `43681000`
- V1 rules: 10 USDC standard Dream Plaza listing, 100 USDC homepage spotlight listing, each visible for 3 days.

## 1. Accounts And Keys

Create or prepare these items:

- A deployer wallet with Base Sepolia ETH for gas.
- A WalletConnect Project ID.
- A Pinata JWT or another IPFS pinning provider.
- A Base Sepolia USDC address for testing.
- Three recipient addresses:
  - `SOMNIA_TREASURY`
  - `SOMNIA_DREAM_VAULT`
  - `SOMNIA_REVIEWER_REWARDS`

Use multisig addresses for the three recipients before any public launch. For the first private test, separate test wallets are acceptable.

## 2. Environment File

Create `.env.local` from `.env.example`.

```bash
copy .env.example .env.local
```

Fill these fields:

```bash
NEXT_PUBLIC_CHAIN=baseSepolia
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_SOMNIA_CONTRACT=
NEXT_PUBLIC_SOMNIA_DEPLOY_BLOCK=
NEXT_PUBLIC_USDC_ADDRESS=

PINATA_JWT=

DEPLOYER_PRIVATE_KEY=
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
SOMNIA_TREASURY=
SOMNIA_DREAM_VAULT=
SOMNIA_REVIEWER_REWARDS=
```

Before the contract is deployed, leave `NEXT_PUBLIC_SOMNIA_CONTRACT` empty. After deployment, paste the deployed address there.

## 3. Preflight

Compile the contract:

```bash
pnpm compile
```

After `.env.local` is filled, check required values:

```bash
pnpm check:env
```

## 4. Deploy Contract

Deploy to Base Sepolia:

```bash
pnpm deploy:base-sepolia
```

Copy the printed `SomniaDreamRegistry` address into:

```bash
NEXT_PUBLIC_SOMNIA_CONTRACT=
NEXT_PUBLIC_SOMNIA_DEPLOY_BLOCK=
```

Use the deployment block, or a block shortly before deployment, for `NEXT_PUBLIC_SOMNIA_DEPLOY_BLOCK`. The frontend reads `DreamPublished` events from this point in small ranges so Base Sepolia RPC limits do not block the Dream Plaza.

Restart the app after changing `.env.local`.

## 5. Test Publish Flow

Run the app:

```bash
pnpm dev
```

Then test:

1. Open `http://localhost:3000`.
2. Connect a wallet on Base Sepolia.
3. Make sure the wallet has test ETH and test USDC.
4. Fill the Dream form.
5. Submit.
6. Confirm USDC approval.
7. Confirm `publishDreamWithPlacement`.
8. Check the contract events for `DreamPublished`.

## 6. Expected Fee Split

For every publish fee, whether 10 USDC standard placement or 100 USDC homepage spotlight, the split is:

- 50 percent goes to Somnia Treasury.
- 30 percent goes to Dream Vault.
- 20 percent goes to Reviewer Rewards.

That means:

- Standard 10 USDC: 5 / 3 / 2 USDC.
- Featured 100 USDC: 50 / 30 / 20 USDC.

## 7. Do Not Mainnet Yet

Do not deploy this to mainnet until:

- The terms clearly say Signals are not investments.
- The contract has been reviewed or audited.
- Recipient wallets are multisigs.
- Reviewer Rewards policy is written.
- Dream moderation and hidden Dream rules are written.
- A production indexer is connected.
