import config from '@configs/configuration';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { WalletService } from '@modules/wallet/wallet.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: config.GRPC_CLIENT.WALLET.NAME,
        transport: Transport.GRPC,
        options: {
          package: '',
          protoPath: join(__dirname, 'protos/wallet.proto'),
          url: config.GRPC_CLIENT.WALLET.HOST,
          loader: {
            keepCase: true,
          },
        },
      },
    ]),
  ],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
