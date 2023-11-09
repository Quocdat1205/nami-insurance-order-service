import { AppModule } from '@app/app.module';
import { NestFactory } from '@nestjs/core';
import appConfig from '@configs/app.config';
import config from '@configs/configuration';
import { SystemLogger } from '@commons/modules/logger/system-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    snapshot: true,
  });
  app.useLogger(app.get(SystemLogger));
  await appConfig(app);
  await app.listen(config.PORT).then(async () => {
    console.log('Server is listening on:', await app.getUrl());
  });
}
bootstrap();
