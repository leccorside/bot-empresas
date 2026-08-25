import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { AppModule } from './module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: { origin: true, credentials: true } });
  app.use(helmet()); app.use(compression());
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  const config = new DocumentBuilder().setTitle('Local Prospector API').setDescription('API de prospecção B2B local').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  app.enableShutdownHooks();
  await app.listen(3001, '0.0.0.0');
}
bootstrap();
