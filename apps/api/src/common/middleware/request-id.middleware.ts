import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attaches a unique `requestId` to every request for log correlation.
 * Uses `X-Request-Id` header if provided; otherwise generates UUIDv7-compatible UUID.
 */
export function RequestIdMiddleware(req: Request, _res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  (req as any).requestId = requestId;
  _res.setHeader('X-Request-Id', requestId);
  next();
}
