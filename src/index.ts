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
  batchKeepOwnerVaultsAlive,
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
  BatchKeepOwnerVaultsAliveResult,
} from "./factoryClient.js";

export { randomSalt, ownerNonceSalt } from "./salt.js";

export { VAULT_ERROR_TYPES, FACTORY_ERROR_TYPES } from "./errors.js";

export {
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  extendTtl,
  extendVaultsByOwnerTtl,
  keepAlive,
  batchKeepAlive,
  buildBatchExtendTtlOperation,
  buildBatchExtendTtlOperations,
  buildBatchExtendTtlTransaction,
} from "./keeper.js";
export type {
  TtlExtendable,
  VaultsByOwnerTtlExtendable,
  KeepAliveOptions,
  KeepAliveResult,
  BatchKeepAliveOptions,
  BatchSummary,
  BatchKeepAliveResult,
  BuildBatchExtendTtlTxParams,
} from "./keeper.js";

export { getVaultSnapshot, getFactorySnapshot } from "./snapshot.js";
export type {
  VaultSnapshot,
  VaultReader,
  FactorySnapshot,
  FactoryReader,
  SnapshotOptions,
} from "./snapshot.js";

export {
  withRetry,
  isTransientError,
  calculateBackoff,
} from "./utils/retry.js";
export type { RetryOptions } from "./utils/retry.js";

export {
  decodeVaultEvent,
  decodeFactoryEvent,
  decodeVaultEvents,
  decodeFactoryEvents,
  subscribeVaultEvents,
} from "./events.js";
export type {
  RawContractEvent,
  EventStreamOptions,
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
