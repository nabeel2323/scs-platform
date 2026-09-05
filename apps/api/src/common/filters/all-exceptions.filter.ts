import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter — produces RFC 7807 `application/problem+json` responses.
 *
 * Per RFC 7807 the Content-Type MUST be `application/problem+json`.
 * Shape: { type, title, status, detail, instance, ...extensions }
 */

/**
 * Postgres SQLSTATE → client-error mapping.
 *
 * Without this, a malformed path or query param compared against a `uuid`
 * column (e.g. `GET /v1/stores/gulf-tech`) reaches the driver, raises 22P02,
 * and surfaces as an opaque 500 — indistinguishable from a real server fault
 * and wrong for the client, which sent bad input.
 */
const PG_CLIENT_ERRORS: Record<string, { status: HttpStatus; title: string }> = {
  '22P02': { status: HttpStatus.BAD_REQUEST, title: 'Malformed identifier' },
  '22007': { status: HttpStatus.BAD_REQUEST, title: 'Malformed date' },
  '22001': { status: HttpStatus.BAD_REQUEST, title: 'Value too long' },
  '23514': { status: HttpStatus.BAD_REQUEST, title: 'Value violates constraint' },
  '23505': { status: HttpStatus.CONFLICT, title: 'Already exists' },
  '23503': { status: HttpStatus.CONFLICT, title: 'Referenced record missing' },
};

/** Duck-typed driver error; avoids coupling this filter to the `pg` package. */
function sqlStateOf(exception: unknown): string | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const code = (exception as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal server error';
    let detail = 'An unexpected error occurred';
    let type = 'https://api.scsp.dev/errors/server/internal';
    let extensions: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'object' && exResponse !== null) {
        const ex = exResponse as Record<string, unknown>;

        // class-validator returns message as string[]
        const rawMessage = ex['message'];
        if (Array.isArray(rawMessage)) {
          title = 'Validation failed';
          detail = rawMessage.join('; ');
          extensions['errors'] = rawMessage;
        } else {
          title = (ex['title'] as string) || (ex['error'] as string) || exception.message;
          detail = (ex['detail'] as string) || (ex['message'] as string) || exception.message;
        }

        // Preserve RFC 7807 extensions if already present
        if (ex['type'] && typeof ex['type'] === 'string') type = ex['type'];
        for (const key of ['deltas', 'field', 'code']) {
          if (ex[key] !== undefined) extensions[key] = ex[key];
        }
      } else if (typeof exResponse === 'string') {
        title = exception.message;
        detail = exResponse;
      } else {
        title = exception.message;
        detail = exception.message;
      }

      // Map status to error family URI
      const family = this.getFamily(status);
      if (!extensions['type']) {
        type = `https://api.scsp.dev/errors/${family}/${status}`;
      }
    } else {
      // Not an HttpException: check whether the driver reported a client fault.
      const sqlState = sqlStateOf(exception);
      const mapped = sqlState ? PG_CLIENT_ERRORS[sqlState] : undefined;
      if (mapped) {
        status = mapped.status;
        title = mapped.title;
        detail = exception instanceof Error ? exception.message : 'Invalid request';
        type = `https://api.scsp.dev/errors/client/${mapped.status}`;
        extensions['code'] = sqlState;
      }
    }

    // RFC 7807: Content-Type MUST be application/problem+json
    response.setHeader('Content-Type', 'application/problem+json');
    response.status(status).json({
      type,
      title,
      status,
      detail,
      instance: request.url,
      ...extensions,
    });
  }

  private getFamily(status: number): string {
    if (status >= 400 && status < 500) return 'client';
    if (status >= 500) return 'server';
    return 'unknown';
  }
}
