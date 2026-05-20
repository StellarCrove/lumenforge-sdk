import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";

export interface LumenVaultClientOptions {
  contractId: string;
  rpcUrl: string;
  networkPassphrase?: string;
}

export class LumenVaultClient {
  private readonly contract: Contract;
  private readonly server: SorobanRpc.Server;
  private readonly networkPassphrase: string;

  constructor(opts: LumenVaultClientOptions) {
    this.contract = new Contract(opts.contractId);
    this.server = new SorobanRpc.Server(opts.rpcUrl);
    this.networkPassphrase = opts.networkPassphrase ?? Networks.TESTNET;
  }

  async balance(): Promise<bigint> {
    const account = await this.server.getAccount(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call("balance"))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (!SorobanRpc.Api.isSimulationSuccess(sim)) {
      throw new Error("simulation failed");
    }
    return scValToNative(sim.result!.retval) as bigint;
  }

  buildDepositOperation(from: string, amount: bigint) {
    return this.contract.call(
      "deposit",
      new Address(from).toScVal(),
      nativeToScVal(amount, { type: "i128" }),
    );
  }

  buildWithdrawOperation(amount: bigint) {
    return this.contract.call(
      "withdraw",
      nativeToScVal(amount, { type: "i128" }),
    );
  }
}
