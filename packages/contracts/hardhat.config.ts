import "@nomicfoundation/hardhat-toolbox";
import { config as loadEnv } from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

loadEnv();

const POLYGON_AMOY_RPC_URL =
  process.env.POLYGON_AMOY_RPC_URL ?? "https://polygon-amoy-bor-rpc.publicnode.com";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY ?? "";

// Chap nhan private key co hoac khong co tien to 0x, roi chuan hoa ve dang 0x.
// Gia tri mau trong .env.example bi bo qua, neu khong Hardhat se bao loi config
// va chan ca cac lenh chay local (test, node, deploy:local).
const RAW_PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY?.trim() ?? "";
const NORMALIZED_PRIVATE_KEY = RAW_PRIVATE_KEY.startsWith("0x")
  ? RAW_PRIVATE_KEY
  : `0x${RAW_PRIVATE_KEY}`;
const BLOCKCHAIN_ACCOUNTS = /^0x[0-9a-fA-F]{64}$/.test(NORMALIZED_PRIVATE_KEY)
  ? [NORMALIZED_PRIVATE_KEY]
  : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Mang thu nghiem mien phi, dung de demo bao ve do an.
    polygonAmoy: {
      url: POLYGON_AMOY_RPC_URL,
      accounts: BLOCKCHAIN_ACCOUNTS,
      chainId: 80002,
    },
  },
  etherscan: {
    apiKey: {
      polygonAmoy: POLYGONSCAN_API_KEY,
    },
  },
};

export default config;
