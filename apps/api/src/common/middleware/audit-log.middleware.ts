import { Request, Response, NextFunction } from 'express';

/**
 * Audit log middleware — captures mutating requests for the audit trail.
 * Writes to `audit_logs` table via the AuditModule service.
 *
 * Audited actions: verification decisions, refunds, price overrides,
 * admin impersonation, flag changes, and all admin mutations.
 */
export function AuditLogMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only audit mutating methods
  const method = req.method;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const requestId = (req as any).requestId;
    // Store audit context on the request for the audit service to pick up
    (req as any).auditContext = {
      action: `${method.toLowerCase()}:${req.path}`,
      resource: req.path,
      actorId: (req as any).userId || null,
      ip: req.ip,
      requestId,
      timestamp: new Date(),
    };
  }
  next();
}
