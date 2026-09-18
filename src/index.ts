export { connectVault, deployVault } from "./vaultClient.js";
export type {
  VaultClient,
  VaultMethods,
  DeployVaultArgs,
  DeployVaultOptions,
} from "./vaultClient.js";

export {
  connectFactory,
  deployVaultViaFactory,
  iterateVaultsByOwner,
  collectVaultsByOwner,
  iterateVaultSnapshotsByOwner,
  collectVaultSnapshotsByOwner,
  keepOwnerVaultsAlive,
} from "./factoryClient.js";
export type {
  FactoryClient,
  FactoryMethods,
  VaultsByOwnerReader,
  VaultDeployer,
  DeployVaultViaFactoryArgs,
  DeployVaultViaFactoryOptions,
  PaginationOptions,
  VaultWithSnapshot,
  KeepOwnerVaultsAliveResult,
} from "./factoryClient.js";

export { randomSalt, ownerNonceSalt } from "./salt.js";

export { VAULT_ERROR_TYPES, FACTORY_ERROR_TYPES } from "./errors.js";

export {
  extendTtl,
  extendVaultsByOwnerTtl,
  keepAlive,
} from "./keeper.js";
export type {
  TtlExtendable,
  VaultsByOwnerTtlExtendable,
  KeepAliveOptions,
  KeepAliveResult,
} from "./keeper.js";

export { getVaultSnapshot, getFactorySnapshot } from "./snapshot.js";
export type {
  VaultSnapshot,
  VaultReader,
  FactorySnapshot,
  FactoryReader,
} from "./snapshot.js";

export {
  decodeVaultEvent,
  decodeFactoryEvent,
  decodeVaultEvents,
  decodeFactoryEvents,
} from "./events.js";
export type {
  RawContractEvent,
  VaultEvent,
  FactoryEvent,
  DepositEvent,
  WithdrawEvent,
  PausedEvent,
  ResumedEvent,
  OwnerProposedEvent,
  OwnerProposalCancelledEvent,
  OwnerTransferredEvent,
  MinDepositUpdatedEvent,
  MaxBalanceUpdatedEvent,
  RescuedEvent,
  VaultDeployedEvent,
} from "./events.js";
