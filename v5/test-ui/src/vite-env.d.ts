/// <reference types="vite/client" />

declare module "*.clar?raw" {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_STACKS_API_URL?: string;
  readonly VITE_DEPLOYER_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
