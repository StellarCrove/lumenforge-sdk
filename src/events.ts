import { scValToNative, xdr } from "@stellar/stellar-sdk";

/**
 * The minimal shape needed to decode a contract event — matches
 * `rpc.Api.EventResponse` (what `server.getEvents()` returns) directly,
 * so a result from that call can be passed straight in.
 */
export interface RawContractEvent {
  topic: xdr.ScVal[];
  value: xdr.ScVal;
}

export interface DepositEvent {
  type: "deposit";
  from: string;
  amount: bigint;
  new_balance: bigint;
}
export interface WithdrawEvent {
  type: "withdraw";
  owner: string;
  amount: bigint;
  new_balance: bigint;
}
export interface PausedEvent {
  type: "paused";
  owner: string;
}
export interface ResumedEvent {
  type: "resumed";
  owner: string;
}
export interface OwnerProposedEvent {
  type: "owner_proposed";
  new_owner: string;
}
export interface OwnerProposalCancelledEvent {
  type: "owner_proposal_cancelled";
  cancelled_owner: string;
}
export interface OwnerTransferredEvent {
  type: "owner_transferred";
  new_owner: string;
}
export interface MinDepositUpdatedEvent {
  type: "min_deposit_updated";
  min_deposit: bigint;
}
export interface MaxBalanceUpdatedEvent {
  type: "max_balance_updated";
  /** `undefined` when the cap was removed (`set_max_balance(None)`). */
  max_balance: bigint | undefined;
}
export interface RescuedEvent {
  type: "rescued";
  token: string;
  to: string;
  amount: bigint;
}

/** Every event `lumen_vault` can publish. */
export type VaultEvent =
  | DepositEvent
  | WithdrawEvent
  | PausedEvent
  | ResumedEvent
  | OwnerProposedEvent
  | OwnerProposalCancelledEvent
  | OwnerTransferredEvent
  | MinDepositUpdatedEvent
  | MaxBalanceUpdatedEvent
  | RescuedEvent;

export interface VaultDeployedEvent {
  type: "vault_deployed";
  owner: string;
  vault: string;
}

/** Every event `lumen_vault_factory` can publish. */
export type FactoryEvent = VaultDeployedEvent;

/**
 * Field layout for one event: `topics` names the `#[topic]`-marked fields
 * in declaration order (topics[0] on the wire is always the event's own
 * name, a plain Symbol — everything here starts *after* that), and `data`
 * names the remaining fields, which arrive as a `Symbol`-keyed map
 * (`lumen_vault`/`lumen_vault_factory` don't override `data_format`, so
 * both contracts use `#[contractevent]`'s default `Map` format — even a
 * single data field arrives wrapped in a one-entry map, not bare).
 */
interface EventShape {
  topics: readonly string[];
  data: readonly string[];
}

const VAULT_EVENT_SHAPES: Record<string, EventShape> = {
  deposit: { topics: ["from"], data: ["amount", "new_balance"] },
  withdraw: { topics: ["owner"], data: ["amount", "new_balance"] },
  paused: { topics: ["owner"], data: [] },
  resumed: { topics: ["owner"], data: [] },
  owner_proposed: { topics: ["new_owner"], data: [] },
  owner_proposal_cancelled: { topics: ["cancelled_owner"], data: [] },
  owner_transferred: { topics: ["new_owner"], data: [] },
  min_deposit_updated: { topics: [], data: ["min_deposit"] },
  max_balance_updated: { topics: [], data: ["max_balance"] },
  rescued: { topics: ["token", "to"], data: ["amount"] },
};

const FACTORY_EVENT_SHAPES: Record<string, EventShape> = {
  vault_deployed: { topics: ["owner"], data: ["vault"] },
};

/**
 * Decodes topics/data into a plain object keyed by `shape`'s field names,
 * plus `type: name`. Returns `undefined` if `name` isn't in `shapes` —
 * e.g. an unrelated event on the same ledger, or from a future contract
 * version this SDK doesn't know about yet — rather than throwing, so a
 * caller scanning a mixed event stream can just skip what it doesn't
 * recognize.
 */
function decode<T extends { type: string }>(
  shapes: Record<string, EventShape>,
  event: RawContractEvent,
): T | undefined {
  if (event.topic.length === 0) return undefined;
  const name = scValToNative(event.topic[0]) as unknown;
  if (typeof name !== "string") return undefined;
  const shape = shapes[name];
  if (!shape) return undefined;

  // `scValToNative` maps Soroban's `Void` (what `Option::None` becomes) to
  // `null`; the rest of this SDK uses `undefined` for absent Option
  // values (see `VaultMethods.max_balance`), so normalize here too.
  const orUndefined = (v: unknown): unknown => (v === null ? undefined : v);

  const topicVals = event.topic.slice(1).map((t) => orUndefined(scValToNative(t)));
  if (topicVals.length !== shape.topics.length) return undefined;

  const dataVal = scValToNative(event.value);
  const dataObj =
    shape.data.length === 0 ? {} : (dataVal as Record<string, unknown>);

  const result: Record<string, unknown> = { type: name };
  shape.topics.forEach((field, i) => (result[field] = topicVals[i]));
  shape.data.forEach((field) => (result[field] = orUndefined(dataObj[field])));
  return result as T;
}

/**
 * Decodes a raw event into a typed `VaultEvent`, or `undefined` if it
 * isn't one `lumen_vault` publishes (e.g. the SEP-41 token's own
 * `transfer` event, which `deposit`/`withdraw`/`rescue` also emit as a
 * side effect of moving the underlying token).
 */
export function decodeVaultEvent(
  event: RawContractEvent,
): VaultEvent | undefined {
  return decode<VaultEvent>(VAULT_EVENT_SHAPES, event);
}

/** Decodes a raw event into a typed `FactoryEvent`, or `undefined`. */
export function decodeFactoryEvent(
  event: RawContractEvent,
): FactoryEvent | undefined {
  return decode<FactoryEvent>(FACTORY_EVENT_SHAPES, event);
}
