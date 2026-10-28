import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { assertJwtConfig, assertOtpHmacConfig, assertProductionConfig, resolveTrustProxy } from './config/env-gate';

async function bootstrap() {
  // Fail fast on insecure JWT configuration (API-B7) before creating the app,
  // binding a port, or opening any DB/Redis connections.
  assertJwtConfig();

  // S1.3 M-02: the OTP challenge store is keyed by HMAC(OTP_HMAC_SECRET, ...). A
  // missing/placeholder/short secret lets anyone with Redis read access precompute
  // every code, so refuse to boot a deployed process that is not configured with a
  // unique strong secret. No-op (dev fallback) in development/test.
  assertOtpHmacConfig();

  // P13 Phase 4.1: refuse to boot a deployed process that would silently fall back to
  // the development PostgreSQL/Redis endpoints, and refuse one whose alert webhook is
  // set but undeliverable. No-op outside production-like NODE_ENV. Returns a
  // non-sensitive summary, so the channel can be logged without the URL.
  const alertSink = assertProductionConfig();
  new Logger('Bootstrap').log(
    `P13 alert channel: ${alertSink.channel}` +
      (alertSink.configured ? '' : ' (no webhook configured — alerts are persisted and logged only)'),
  );

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // ── S1.7: Proxy trust configuration ──────────────────────────
  // Must be set BEFORE any middleware that reads req.ip (throttler, CORS, etc.).
  // When TRUST_PROXY is unset/false (default), Express uses the direct TCP peer —
  // safe for direct connections but all clients behind a NAT share one IP bucket.
  // When set to a hop count, IP list, or CIDR list, req.ip resolves through the
  // X-Forwarded-For chain to the correct client identity.
  const trustProxy = resolveTrustProxy(process.env['TRUST_PROXY']);
  const httpAdapter = app.getHttpAdapter();
  // NestJS wraps Express; the underlying instance supports app.set().
  if (typeof (httpAdapter as any).getInstance === 'function') {
    (httpAdapter as any).getInstance().set('trust proxy', trustProxy);
  }
  if (trustProxy !== false) {
    new Logger('Bootstrap').log(
      `Trust proxy: ${typeof trustProxy === 'number' ? `hop count ${trustProxy}` : Array.isArray(trustProxy) ? trustProxy.join(', ') : String(trustProxy)}`,
    );
  }

  // ── Security ───────────────────────────────────────────────
  app.use(helmet());
  app.enableCors({
    origin: process.env['API_CORS_ORIGINS']?.split(',') || [
      'http://localhost:3100', // web
      'http://localhost:3200', // admin
      'http://localhost:3300', // mobile (if applicable)
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'If-Match', 'X-Device-Id'],
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
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["set-cookie"]',
          'err.response.headers.authorization',
          'err.response.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
    }),
  );

  // ── Request ID correlation ─────────────────────────────────
  app.use(RequestIdMiddleware);

  // Audit trail middleware is registered in AppModule.configure() so it can
  // inject AuditService (see modules/audit/audit-log.middleware.ts).

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

  // ── Graceful shutdown ──────────────────────────────────────
  // Nest does NOT run `onModuleDestroy`/`onApplicationShutdown` on SIGTERM/SIGINT
  // unless this is enabled. The P13 worker releases its lease in `onModuleDestroy`,
  // so without this a container stop would leave `worker_leases` pointing at a dead
  // holder and a standby could only take over after the TTL expired.
  app.enableShutdownHooks();

  // ── Start ──────────────────────────────────────────────────
  const port = Number(process.env['PORT'] || process.env['API_PORT'] || 3000);
  const host = process.env['API_HOST'] || '0.0.0.0';
  await app.listen(port, host);

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 API running on http://${host}:${port}`);
  logger.log(`📖 OpenAPI docs at http://${host}:${port}/docs`);
}

bootstrap();
