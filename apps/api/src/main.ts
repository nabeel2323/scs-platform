import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AuditLogMiddleware } from './common/middleware/audit-log.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // ── Security ───────────────────────────────────────────────
  app.use(helmet());
  app.enableCors({
    origin: process.env['API_CORS_ORIGINS']?.split(',') || [
      'http://localhost:3100',  // web
      'http://localhost:3200',  // admin
      'http://localhost:3300',  // mobile (if applicable)
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'If-Match'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  });

  // ── Logging (pino with requestId correlation) ──────────────
  // pino-http is used as Express middleware (not a DI provider)
  const pinoMiddleware = (await import('pino-http')).default;
  app.use(
    pinoMiddleware({
      level: process.env['LOG_LEVEL'] || 'info',
      transport:
        process.env['NODE_ENV'] === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
          : undefined,
    }),
  );

  // ── Request ID correlation ─────────────────────────────────
  app.use(RequestIdMiddleware);

  // ── Audit log middleware ────────────────────────────────────
  app.use(AuditLogMiddleware);

  // ── Global validation pipe ─────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global exception filter (RFC 7807) ─────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());

  // ── API versioning ─────────────────────────────────────────
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // ── Swagger / OpenAPI ──────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('Smart Commerce & Supply Platform API')
    .setDescription('B2B-first marketplace API — Modular Monolith')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'idempotency')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // ── WebSocket adapter ──────────────────────────────────────
  app.useWebSocketAdapter(new IoAdapter(app));

  // ── Start ──────────────────────────────────────────────────
  const port = process.env['API_PORT'] || 3000;
  const host = process.env['API_HOST'] || '0.0.0.0';
  await app.listen(port, host);

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 API running on http://${host}:${port}`);
  logger.log(`📖 OpenAPI docs at http://${host}:${port}/docs`);
}

bootstrap();
