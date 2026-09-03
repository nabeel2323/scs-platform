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
 * Shape:
 * {
 *   type: 'https://api.scsp.dev/errors/{family}/{code}',
 *   title: string,
 *   status: number,
 *   detail: string,
 *   instance: string
 * }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal server error';
    let detail = 'An unexpected error occurred';
    let type = 'https://api.scsp.dev/errors/internal';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'object' && exResponse !== null) {
        const ex = exResponse as Record<string, unknown>;
        title = (ex['message'] as string) || exception.message;
        detail = (ex['error'] as string) || exception.message;
      } else {
        title = exception.message;
        detail = exception.message;
      }

      // Map status to error family
      const family = this.getFamily(status);
      type = `https://api.scsp.dev/errors/${family}/${status}`;
    }

    response.status(status).json({
      type,
      title,
      status,
      detail,
      instance: request.url,
    });
  }

  private getFamily(status: number): string {
    if (status >= 400 && status < 500) return 'client';
    if (status >= 500) return 'server';
    return 'unknown';
  }
}
