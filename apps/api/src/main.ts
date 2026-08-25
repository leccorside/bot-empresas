import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { logger } from '@prospector/shared';
import { AppModule } from './module';

const log = logger('api');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: { origin: true, credentials: true } });
  app.use((request: any, response: any, next: () => void) => {
    const requestId = String(request.headers['x-request-id'] ?? randomUUID());
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);
    response.on('finish', () => {
      const context = { requestId, method: request.method, path: request.originalUrl, statusCode: response.statusCode, durationMs: Date.now() - startedAt };
      if (response.statusCode >= 500) log.error(context, 'request completed');
      else if (response.statusCode >= 400) log.warn(context, 'request completed');
      else log.info(context, 'request completed');
    });
    next();
  });
  app.use(helmet()); app.use(compression());
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  const config = new DocumentBuilder().setTitle('Local Prospector API').setDescription('API de prospecção B2B local').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  app.enableShutdownHooks();
  await app.listen(3001, '0.0.0.0');
  log.info({ port: 3001 }, 'api online');
}
bootstrap().catch(error => { log.fatal({ error: error instanceof Error ? error.message : String(error) }, 'api startup failed'); process.exit(1); });
