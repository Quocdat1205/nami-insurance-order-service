import config from '@configs/configuration';
import { Inject, Injectable, OnModuleInit, Scope } from '@nestjs/common';
import {
  IChangeBalanceRequest,
  IRequestGetWallet,
  IRequestRollback,
  ITransaction,
  IWalletService,
} from '@modules/wallet/interfaces/wallet.interface';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { safeJSONParse } from '@commons/utils';
import { NamiSlack } from '@commons/modules/logger/platforms/slack.module';

@Injectable({
  scope: Scope.DEFAULT,
})
export class WalletService implements OnModuleInit {
  private grpcWalletService: IWalletService;

  constructor(
    @Inject(config.GRPC_CLIENT.WALLET.NAME) private client: ClientGrpc,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly namiSlack: NamiSlack,
  ) {}

  onModuleInit() {
    this.grpcWalletService = this.client.getService<IWalletService>('Wallet');
  }

  async changeBalance(payload: IChangeBalanceRequest) {
    this.logger.info('changeBalance grpc', payload);
    if (typeof payload?.options === 'object') {
      payload.options = JSON.stringify(payload.options);
    }
    const result = await firstValueFrom(
      this.grpcWalletService.changeBalance(payload),
    );
    if (result?.metadata) {
      result.metadata = JSON.parse(result?.metadata, safeJSONParse);
    }
    return result as ITransaction & { metadata: object };
  }

  async rollback(payload: IRequestRollback, retry = 0) {
    if (retry > 1) {
      this.logger.error('rollback grpc ERROR many times', { payload, retry });
      return;
    }
    try {
      this.logger.info('rollback grpc', payload);
      this.namiSlack.sendSlackMessage(`WALLET ROLLBACK ${new Date()}`, payload);
      return await firstValueFrom(
        this.grpcWalletService.rollbackWallet(payload),
      );
    } catch (error) {
      this.logger.error('rollback grpc ERROR', {
        payload,
        error: new Error(error),
      });
      this.namiSlack.sendSlackMessage(`WALLET ROLLBACK ERROR ${new Date()}`, {
        payload,
        error,
      });
      setTimeout(() => this.rollback(payload, retry + 1), 1000);
    }
  }

  async getWallet(payload: IRequestGetWallet) {
    return firstValueFrom(this.grpcWalletService.getWallet(payload));
  }

  async getAvailable(payload: IRequestGetWallet) {
    const { result } = await firstValueFrom(
      this.grpcWalletService.getAvailable(payload),
    );
    return result;
  }
}
