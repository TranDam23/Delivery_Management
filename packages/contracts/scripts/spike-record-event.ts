/**
 * Spike GĐ0: kiem chung vong doi ghi/doc mot moc su kien giao nhan len chain.
 *
 * Muc tieu KHONG phai lam chuc nang, ma la tra loi 4 cau hoi truoc khi buoc vao GD5:
 *   1. Ghi duoc mot su kien len chain that khong?
 *   2. Doc nguoc lai co ra dung du lieu vua ghi khong (hash khop)?
 *   3. Mot lan ghi mat bao lau -> quyet dinh ghi dong bo hay bat dong bo?
 *   4. Ton bao nhieu gas -> uoc luong duoc chi phi demo?
 *
 * Cach chay:
 *   npx hardhat run scripts/spike-record-event.ts --network localhost
 *   npx hardhat run scripts/spike-record-event.ts --network polygonAmoy
 *
 * Neu dat SPIKE_CONTRACT_ADDRESS thi script attach vao contract co san,
 * neu khong thi tu deploy mot ban moi.
 */
import { ethers, network } from "hardhat";
import type { DeliveryTracking } from "../typechain-types";

/** Payload chi tiet nam o Supabase; len chain chi co keccak256 cua no. */
interface EventPayload {
  orderId: string;
  statusCode: string;
  note: string;
  performedByUserId: string;
  eventTime: string;
}

function hashPayload(payload: EventPayload): string {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload)));
}

function explorerTxUrl(chainId: bigint, txHash: string): string | null {
  return chainId === 80002n ? `https://amoy.polygonscan.com/tx/${txHash}` : null;
}

async function main() {
  const [operator] = await ethers.getSigners();
  if (!operator) {
    throw new Error(
      "Khong tim thay signer nao. Kiem tra BLOCKCHAIN_PRIVATE_KEY trong packages/contracts/.env",
    );
  }
  const net = await ethers.provider.getNetwork();

  console.log("=".repeat(64));
  console.log("SPIKE ghi/doc su kien len blockchain");
  console.log("=".repeat(64));
  console.log("Network        :", network.name, "(chainId", net.chainId.toString() + ")");
  console.log("Vi operator    :", operator.address);
  console.log(
    "So du          :",
    ethers.formatEther(await ethers.provider.getBalance(operator.address)),
    "POL",
  );

  // --- Chuan bi contract -----------------------------------------------------
  const existingAddress = process.env.SPIKE_CONTRACT_ADDRESS;
  let contract: DeliveryTracking;

  if (existingAddress) {
    contract = (await ethers.getContractAt(
      "DeliveryTracking",
      existingAddress,
    )) as unknown as DeliveryTracking;
    console.log("Contract       :", existingAddress, "(attach vao ban co san)");
  } else {
    const factory = await ethers.getContractFactory("DeliveryTracking");
    const deployed = (await factory.deploy(
      operator.address,
    )) as unknown as DeliveryTracking;
    await deployed.waitForDeployment();
    contract = deployed;
    console.log("Contract       :", await deployed.getAddress(), "(vua deploy moi)");
  }

  // --- Du lieu gia lap -------------------------------------------------------
  // Tracking code co timestamp de moi lan chay la mot don khac nhau,
  // tranh doc nham su kien cua lan chay truoc.
  const trackingCode = `SPIKE${Date.now()}`;
  const payload: EventPayload = {
    orderId: "00000000-0000-0000-0000-000000000001",
    statusCode: "CREATED",
    note: "Don hang duoc tao boi spike GD0",
    performedByUserId: "00000000-0000-0000-0000-0000000000aa",
    eventTime: new Date().toISOString(),
  };
  const eventDataHash = hashPayload(payload);

  console.log("\n--- 1. GHI SU KIEN ---");
  console.log("Tracking code  :", trackingCode);
  console.log("Event type     : ORDER_CREATED");
  console.log("Hash payload   :", eventDataHash);

  const sentAt = Date.now();
  const tx = await contract.recordEvent(
    trackingCode,
    "ORDER_CREATED",
    operator.address,
    eventDataHash,
  );
  const submittedMs = Date.now() - sentAt;
  console.log("Tx hash        :", tx.hash);
  console.log("Gui len mempool:", submittedMs, "ms");

  const receipt = await tx.wait();
  if (!receipt) throw new Error("Giao dich bi drop truoc khi duoc xac nhan");
  const confirmedMs = Date.now() - sentAt;

  console.log("Block          :", receipt.blockNumber);
  console.log("Gas su dung    :", receipt.gasUsed.toString());
  console.log("Xac nhan sau   :", confirmedMs, "ms  <-- so nay quyet dinh GD5 ghi dong bo hay khong");

  const feeWei = receipt.gasUsed * (receipt.gasPrice ?? 0n);
  console.log("Chi phi        :", ethers.formatEther(feeWei), "POL");

  const url = explorerTxUrl(net.chainId, tx.hash);
  if (url) console.log("Xem tren       :", url);

  // --- 2. Doc nguoc lai tu chain --------------------------------------------
  console.log("\n--- 2. DOC NGUOC LAI TU CHAIN ---");
  const events = await contract.getEvents(trackingCode);
  console.log("So su kien     :", events.length);

  const onChain = events[0];
  if (!onChain) throw new Error("Doc lai tu chain khong thay su kien nao");
  console.log("trackingCode   :", onChain.trackingCode);
  console.log("eventType      :", onChain.eventType);
  console.log("performedBy    :", onChain.performedBy);
  console.log("eventDataHash  :", onChain.eventDataHash);
  console.log(
    "timestamp      :",
    new Date(Number(onChain.timestamp) * 1000).toISOString(),
  );

  // --- 3. Xac minh: bam lai payload va doi chieu -----------------------------
  console.log("\n--- 3. XAC MINH (mo phong chuc nang tra cuu cua GD5) ---");
  const recomputed = hashPayload(payload);
  const matched = recomputed === onChain.eventDataHash;
  console.log("Hash bam lai   :", recomputed);
  console.log("Ket qua        :", matched ? "KHOP - du lieu toan ven" : "KHONG KHOP");

  // Chung minh chieu nguoc lai: sua mot ky tu trong payload thi hash phai lech.
  const tampered = { ...payload, note: payload.note + "!" };
  const tamperedMatched = hashPayload(tampered) === onChain.eventDataHash;
  console.log(
    "Thu sua payload:",
    tamperedMatched ? "VAN KHOP (SAI - hash vo dung)" : "LECH ngay - phat hien duoc sua doi",
  );

  console.log("\n" + "=".repeat(64));
  console.log(matched && !tamperedMatched ? "SPIKE THANH CONG" : "SPIKE THAT BAI");
  console.log("=".repeat(64));

  if (!matched || tamperedMatched) process.exitCode = 1;
}

main().catch((error) => {
  console.error("LOI:", error.shortMessage ?? error.message);
  process.exitCode = 1;
});
