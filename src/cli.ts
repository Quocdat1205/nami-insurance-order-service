import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommandModule, CommandService } from 'nestjs-command';
// eslint-disable-next-line no-restricted-imports
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  const logger = new Logger();

  try {
    await app.select(CommandModule).get(CommandService).exec();
    process.exit(0);
  } catch (err: unknown) {
    logger.error(err, 'Migration');
    process.exit(1);
  }
}

bootstrap();
