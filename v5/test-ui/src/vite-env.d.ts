/// <reference types="vite/client" />

declare module "*.clar?raw" {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_STACKS_API_URL?: string;
  readonly VITE_DEPLOYER_ADDRESS?: string;
  readonly VITE_POX_4_CONTRACT?: string;
  readonly VITE_POX_REWARD_CYCLE_LENGTH?: string;
  readonly VITE_BITCOIN_BLOCK_MS?: string;
  readonly VITE_ESTIMATED_SECONDS_PER_BURN_BLOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
