const { formatEther } = require("viem");
const hre = require("hardhat");

async function main() {
  const [walletClient] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  if (!walletClient?.account) {
    throw new Error("No deployer wallet configured.");
  }

  const balance = await publicClient.getBalance({
    address: walletClient.account.address
  });

  console.log(`Deployer address: ${walletClient.account.address}`);
  console.log(`Base Sepolia ETH balance: ${formatEther(balance)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
