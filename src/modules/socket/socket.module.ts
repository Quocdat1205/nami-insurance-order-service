import { Module } from '@nestjs/common';
import { SocketService } from '@modules/socket/socket.service';

@Module({
  providers: [SocketService],
  exports: [SocketService],
})
export class SocketModule {}
