import { Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  decodeFactoryEvent,
  decodeFactoryEvents,
  decodeVaultEvent,
  decodeVaultEvents,
  type RawContractEvent,
} from "./events.js";

// Builders that mirror exactly what `#[contractevent]` (soroban-sdk 27,
// default `data_format = "map"`) puts on the wire — verified empirically
// against `lumenforge-contracts` by dumping `env.events().all()` for
// `Deposit`, `Rescued` (multi-topic), `Paused`/`MinDepositUpdated`
// (zero topic / zero data fields respectively), and `MaxBalanceUpdated`
// with `None` (data map value of `Void`, not an absent key), rather than
// assumed from the macro source alone.

function symbol(name: string): xdr.ScVal {
  return nativeToScVal(name, { type: "symbol" });
}

function address(addr: string): xdr.ScVal {
  return nativeToScVal(addr, { type: "address" });
}

function i128(n: bigint): xdr.ScVal {
  return nativeToScVal(n, { type: "i128" });
}

const voidVal = (): xdr.ScVal => nativeToScVal(undefined);

/** A data map, Symbol-keyed — matches the contract's default `Map` format. */
function dataMap(entries: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.entries(entries).map(
      ([k, v]) => new xdr.ScMapEntry({ key: symbol(k), val: v }),
    ),
  );
}

function event(topics: xdr.ScVal[], value: xdr.ScVal): RawContractEvent {
  return { topic: topics, value };
}

const owner = Keypair.random().publicKey();
const from = Keypair.random().publicKey();
const other = Keypair.random().publicKey();
const token = Keypair.random().publicKey();
const vault = Keypair.random().publicKey();

describe("decodeVaultEvent", () => {
  it("decodes deposit", () => {
    const e = event(
      [symbol("deposit"), address(from)],
      dataMap({ amount: i128(500n), new_balance: i128(500n) }),
    );
    expect(decodeVaultEvent(e)).toEqual({
      type: "deposit",
      from,
      amount: 500n,
      new_balance: 500n,
    });
  });

  it("decodes withdraw", () => {
    const e = event(
      [symbol("withdraw"), address(owner)],
      dataMap({ amount: i128(200n), new_balance: i128(300n) }),
    );
    expect(decodeVaultEvent(e)).toEqual({
      type: "withdraw",
      owner,
      amount: 200n,
      new_balance: 300n,
    });
  });

  it("decodes paused with an empty data map (not void)", () => {
    const e = event([symbol("paused"), address(owner)], dataMap({}));
    expect(decodeVaultEvent(e)).toEqual({ type: "paused", owner });
  });

  it("decodes resumed", () => {
    const e = event([symbol("resumed"), address(owner)], dataMap({}));
    expect(decodeVaultEvent(e)).toEqual({ type: "resumed", owner });
  });

  it("decodes owner_proposed / owner_proposal_cancelled / owner_transferred", () => {
    expect(
      decodeVaultEvent(
        event([symbol("owner_proposed"), address(other)], dataMap({})),
      ),
    ).toEqual({ type: "owner_proposed", new_owner: other });
    expect(
      decodeVaultEvent(
        event(
          [symbol("owner_proposal_cancelled"), address(other)],
          dataMap({}),
        ),
      ),
    ).toEqual({ type: "owner_proposal_cancelled", cancelled_owner: other });
    expect(
      decodeVaultEvent(
        event([symbol("owner_transferred"), address(other)], dataMap({})),
      ),
    ).toEqual({ type: "owner_transferred", new_owner: other });
  });

  it("decodes min_deposit_updated (no topic fields)", () => {
    const e = event([symbol("min_deposit_updated")], dataMap({ min_deposit: i128(5n) }));
    expect(decodeVaultEvent(e)).toEqual({
      type: "min_deposit_updated",
      min_deposit: 5n,
    });
  });

  it("decodes max_balance_updated Some and None", () => {
    const some = event(
      [symbol("max_balance_updated")],
      dataMap({ max_balance: i128(10_000n) }),
    );
    expect(decodeVaultEvent(some)).toEqual({
      type: "max_balance_updated",
      max_balance: 10_000n,
    });

    const none = event(
      [symbol("max_balance_updated")],
      dataMap({ max_balance: voidVal() }),
    );
    expect(decodeVaultEvent(none)).toEqual({
      type: "max_balance_updated",
      max_balance: undefined,
    });
  });

  it("decodes rescued (two topic fields, in declaration order)", () => {
    const e = event(
      [symbol("rescued"), address(token), address(other)],
      dataMap({ amount: i128(100n) }),
    );
    expect(decodeVaultEvent(e)).toEqual({
      type: "rescued",
      token,
      to: other,
      amount: 100n,
    });
  });

  it("returns undefined for an unrelated event (e.g. the token's own transfer)", () => {
    const e = event(
      [symbol("transfer"), address(from), address(vault)],
      i128(500n),
    );
    expect(decodeVaultEvent(e)).toBeUndefined();
  });

  it("returns undefined for an empty topic list", () => {
    expect(decodeVaultEvent(event([], dataMap({})))).toBeUndefined();
  });

  it("returns undefined when the topic count doesn't match the known shape", () => {
    // "deposit" should have exactly one topic field (from); two is wrong.
    const e = event(
      [symbol("deposit"), address(from), address(other)],
      dataMap({ amount: i128(1n), new_balance: i128(1n) }),
    );
    expect(decodeVaultEvent(e)).toBeUndefined();
  });
});

describe("decodeFactoryEvent", () => {
  it("decodes vault_deployed", () => {
    const e = event(
      [symbol("vault_deployed"), address(owner)],
      dataMap({ vault: address(vault) }),
    );
    expect(decodeFactoryEvent(e)).toEqual({
      type: "vault_deployed",
      owner,
      vault,
    });
  });

  it("returns undefined for a vault event passed to the factory decoder", () => {
    const e = event([symbol("deposit"), address(from)], dataMap({ amount: i128(1n), new_balance: i128(1n) }));
    expect(decodeFactoryEvent(e)).toBeUndefined();
  });
});

describe("decodeVaultEvents / decodeFactoryEvents", () => {
  it("decodes a batch, dropping anything unrecognized", () => {
    const events = [
      event([symbol("deposit"), address(from)], dataMap({ amount: i128(1n), new_balance: i128(1n) })),
      event([symbol("transfer"), address(from), address(vault)], i128(1n)), // token's own event
      event([symbol("withdraw"), address(owner)], dataMap({ amount: i128(2n), new_balance: i128(3n) })),
    ];

    const decoded = decodeVaultEvents(events);

    expect(decoded).toEqual([
      { type: "deposit", from, amount: 1n, new_balance: 1n },
      { type: "withdraw", owner, amount: 2n, new_balance: 3n },
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    const events = [
      event([symbol("transfer"), address(from), address(vault)], i128(1n)),
    ];
    expect(decodeVaultEvents(events)).toEqual([]);
    expect(decodeFactoryEvents(events)).toEqual([]);
  });

  it("decodeFactoryEvents decodes a batch of factory events", () => {
    const events = [
      event([symbol("vault_deployed"), address(owner)], dataMap({ vault: address(vault) })),
    ];
    expect(decodeFactoryEvents(events)).toEqual([
      { type: "vault_deployed", owner, vault },
    ]);
  });
});
