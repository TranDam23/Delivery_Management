import { expect } from "chai";
import { ethers } from "hardhat";
import type { DeliveryTracking } from "../typechain-types";

describe("DeliveryTracking", () => {
  async function deployFixture() {
    const [owner, operator, staff, stranger] = await ethers.getSigners();
    if (!owner || !operator || !staff || !stranger) {
      throw new Error("Hardhat network phai cung cap it nhat 4 signer");
    }
    const Factory = await ethers.getContractFactory("DeliveryTracking");
    const contract = (await Factory.deploy(owner.address)) as unknown as DeliveryTracking;
    await contract.waitForDeployment();
    return { contract, owner, operator, staff, stranger };
  }

  it("cho phep owner ghi su kien va tu dong la operator", async () => {
    const { contract, owner } = await deployFixture();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("order-created-payload"));

    await expect(
      contract.recordEvent("DH00001", "ORDER_CREATED", owner.address, hash),
    ).to.emit(contract, "DeliveryEventRecorded");

    expect(await contract.getEventCount("DH00001")).to.equal(1n);
  });

  it("tu choi ghi su kien tu vi khong phai operator", async () => {
    const { contract, stranger, owner } = await deployFixture();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("payload"));

    await expect(
      contract.connect(stranger).recordEvent("DH00002", "ORDER_CREATED", owner.address, hash),
    ).to.be.revertedWithCustomError(contract, "NotOperator");
  });

  it("owner co the cap quyen operator cho vi backend service", async () => {
    const { contract, owner, operator } = await deployFixture();
    await contract.connect(owner).setOperator(operator.address, true);

    const hash = ethers.keccak256(ethers.toUtf8Bytes("payload"));
    await expect(
      contract.connect(operator).recordEvent("DH00003", "PICKED_UP", operator.address, hash),
    ).to.emit(contract, "DeliveryEventRecorded");
  });

  it("luu dung thu tu hanh trinh va tra ve su kien moi nhat", async () => {
    const { contract, owner } = await deployFixture();
    const hash1 = ethers.keccak256(ethers.toUtf8Bytes("1"));
    const hash2 = ethers.keccak256(ethers.toUtf8Bytes("2"));

    await contract.recordEvent("DH00004", "ORDER_CREATED", owner.address, hash1);
    await contract.recordEvent("DH00004", "PICKED_UP", owner.address, hash2);

    const events = await contract.getEvents("DH00004");
    expect(events.length).to.equal(2);

    const latest = await contract.getLatestEvent("DH00004");
    expect(latest.eventType).to.equal("PICKED_UP");
  });
});
