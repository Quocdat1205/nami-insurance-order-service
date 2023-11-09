/* eslint-disable @typescript-eslint/no-empty-interface */
import { Observable } from 'rxjs';

export interface IWalletService {
  changeBalance: (
    changeBalanceRequest: IChangeBalanceRequest,
  ) => Observable<ITransaction>;

  genTransactionId: (
    genTransactionIdRequest: IGenTransactionIdRequest,
  ) => Observable<IGenTransactionIdResponse>;

  getAvailable: (
    requestGetWallet: IRequestGetWallet,
  ) => Observable<IResponseWalletSingleValue>;

  getLocked: (
    requestGetWallet: IRequestGetWallet,
  ) => Observable<IResponseWalletSingleValue>;

  getBalance: (
    requestGetWallet: IRequestGetWallet,
  ) => Observable<IResponseWalletSingleValue>;

  getWallet: (
    requestGetWallet: IRequestGetWallet,
  ) => Observable<IResponseWallet>;

  rollbackWallet: (IRequestRollback) => Observable<IEmpty>;
}

export interface IRequestRollback {
  transactions: ITransaction[];
}

export interface IRequestGetWallet {
  userId: string | number;
  assetId: number;
  walletType: string | number;
}
export interface IResponseWalletSingleValue {
  result: number;
}
export interface IResponseWallet {
  value: number;
  locked_value: number;
  type: number;
}

export interface IGenTransactionIdResponse {
  result: string;
}
export interface IGenTransactionIdRequest {
  prefix: string;
}

export interface ITransaction {
  assetId: number;
  category: string;
  createdAt: number;
  mainBalance: boolean;
  moneyBefore: number;
  moneyAfter: number;
  moneyUse: number;
  note: string;
  portfolioScanned: boolean;
  updatedAt: number;
  userId: string;
  walletType: string;
  txhash: string;
  transactionId: string;
  metadata: string;
}

export interface IChangeBalanceRequest {
  userId: string | number;
  assetId: number;
  valueChange: number;
  lockedValueChange: number;
  category: string | number;
  note: string;
  options?: string | object;
}

export interface ITransferRequest {
  userId: string | number;
  fromWallet: number;
  toWallet: number;
  valueChange: number;
  category?: string | number;
  assetId: number;
  note?: string;
  metadata?: object;
}

export interface IEmpty {}
