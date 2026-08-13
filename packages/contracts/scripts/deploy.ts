import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying DeliveryTracking with account:", deployer.address);

  const DeliveryTracking = await ethers.getContractFactory("DeliveryTracking");
  const contract = await DeliveryTracking.deploy(deployer.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("DeliveryTracking deployed to:", address);
  console.log(
    "Set NEXT_PUBLIC_DELIVERY_CONTRACT_ADDRESS=%s in apps/web/.env",
    address,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
