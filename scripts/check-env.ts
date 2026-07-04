import { loadLocalEnv } from "./load-env";

loadLocalEnv();

const predeploy = process.argv.includes("--predeploy");

const required = [
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  "NEXT_PUBLIC_USDC_ADDRESS",
  "PINATA_JWT",
  "DEPLOYER_PRIVATE_KEY",
  "BASE_SEPOLIA_RPC_URL",
  "SOMNIA_TREASURY",
  "SOMNIA_DREAM_VAULT",
  "SOMNIA_REVIEWER_REWARDS"
];

if (!predeploy) {
  required.push("NEXT_PUBLIC_SOMNIA_CONTRACT");
}

const addressKeys = [
  "NEXT_PUBLIC_USDC_ADDRESS",
  "SOMNIA_TREASURY",
  "SOMNIA_DREAM_VAULT",
  "SOMNIA_REVIEWER_REWARDS"
];

if (!predeploy) {
  addressKeys.push("NEXT_PUBLIC_SOMNIA_CONTRACT");
}

const privateKeyPattern = /^0x[a-fA-F0-9]{64}$/;
const addressPattern = /^0x[a-fA-F0-9]{40}$/;

let failed = false;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key}`);
    failed = true;
  }
}

for (const key of addressKeys) {
  const value = process.env[key];
  if (value && !addressPattern.test(value)) {
    console.error(`Invalid address format for ${key}: ${value}`);
    failed = true;
  }
}

if (process.env.DEPLOYER_PRIVATE_KEY && !privateKeyPattern.test(process.env.DEPLOYER_PRIVATE_KEY)) {
  console.error("Invalid DEPLOYER_PRIVATE_KEY. Expected 0x followed by 64 hex characters.");
  failed = true;
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(predeploy ? "Somnia environment looks ready for deployment." : "Somnia environment looks ready for Base Sepolia.");
}
