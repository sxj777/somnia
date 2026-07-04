const hre = require("hardhat");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function main() {
  const usdc = requireEnv("NEXT_PUBLIC_USDC_ADDRESS");
  const treasury = requireEnv("SOMNIA_TREASURY");
  const dreamVault = requireEnv("SOMNIA_DREAM_VAULT");
  const reviewerRewards = requireEnv("SOMNIA_REVIEWER_REWARDS");

  const registry = await hre.viem.deployContract("SomniaDreamRegistry", [
    usdc,
    treasury,
    dreamVault,
    reviewerRewards
  ]);

  console.log(`SomniaDreamRegistry deployed to ${registry.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
