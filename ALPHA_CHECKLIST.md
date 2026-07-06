# Somnia Alpha Checklist

## Product Scope

- Wallet login through RainbowKit.
- Publish one standard Dream for 10 USDC.
- Publish one homepage spotlight Dream for 100 USDC.
- Keep each published Dream visible for 3 days.
- Upload Dream metadata to IPFS before publishing.
- Approve USDC, then call `publishDreamWithPlacement`.
- Display homepage spotlight carousel, Dream Plaza, Signal counts, expiry time, and fee split.
- Load published Dreams from `DreamPublished` events and IPFS metadata.
- Preserve English and Chinese UI.
- Ship a frontend Somnia Points MVP with wallet profile cards, local activity records, signal points, rules, and leaderboard.

## Required Before Testnet

- Create a WalletConnect project id.
- Create a Pinata JWT or replace the IPFS route with another pinning provider.
- Choose Base Sepolia test USDC address.
- Choose three multisig recipient addresses:
  - Somnia Treasury
  - Dream Vault
  - Reviewer Rewards
- Deploy `SomniaDreamRegistry`.
- Set `NEXT_PUBLIC_SOMNIA_CONTRACT` and `NEXT_PUBLIC_USDC_ADDRESS`.

## Required Before Mainnet

- Legal review of publishing fee language and non-investment positioning.
- Contract audit.
- Multisig ownership transfer.
- Moderation process for hidden Dreams.
- Reviewer Rewards distribution policy.
- Event indexer for production Dream Plaza.
- Terms of service and risk disclosure.

## Known Alpha Limits

- Dream Plaza uses starter/local UI data until an indexer is connected.
- Reviewer Rewards are pooled, not automatically distributed.
- Dream Vault does not yet create milestones or grants.
- Signal voting is UI/local in the Alpha page until contract events are indexed.
- Somnia Points are local frontend records in the MVP until a production indexer or backend ledger is added.
- Expired Dreams are filtered in the UI, but production still needs an event indexer for reliable discovery.
