import { base, baseSepolia } from "wagmi/chains";

export const publishFeeUsdc = "10";
export const publishFeeUnits = 10_000_000n;
export const featuredFeeUsdc = "100";
export const featuredFeeUnits = 100_000_000n;
export const displayDurationDays = 3;

export const chain =
  process.env.NEXT_PUBLIC_CHAIN === "base" ? base : baseSepolia;

export const somniaContractAddress =
  process.env.NEXT_PUBLIC_SOMNIA_CONTRACT as `0x${string}` | undefined;

export const somniaDeployBlock = process.env.NEXT_PUBLIC_SOMNIA_DEPLOY_BLOCK
  ? BigInt(process.env.NEXT_PUBLIC_SOMNIA_DEPLOY_BLOCK)
  : undefined;

export const usdcAddress =
  process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined;

export const hasOnchainConfig = Boolean(somniaContractAddress && usdcAddress);

export const feeSplit = [
  { key: "treasury", percent: 50 },
  { key: "dreamVault", percent: 30 },
  { key: "reviewerRewards", percent: 20 }
];

export const categories = [
  { value: "AI", labelKey: "catAI" },
  { value: "Healthcare", labelKey: "catHealthcare" },
  { value: "Consumer", labelKey: "catConsumer" },
  { value: "Education", labelKey: "catEducation" },
  { value: "Public Goods", labelKey: "catPublicGoods" },
  { value: "Web3", labelKey: "catWeb3" }
] as const;
