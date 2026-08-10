export { connectVault, deployVault } from "./vaultClient.js";
export type {
  VaultClient,
  VaultMethods,
  DeployVaultArgs,
  DeployVaultOptions,
} from "./vaultClient.js";

export { connectFactory } from "./factoryClient.js";
export type { FactoryClient, FactoryMethods } from "./factoryClient.js";

export { randomSalt, ownerNonceSalt } from "./salt.js";

export { VAULT_ERROR_TYPES, FACTORY_ERROR_TYPES } from "./errors.js";
