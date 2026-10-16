/**
 * Public surface of the audit module.
 *
 * Cross-module consumers import from here rather than reaching into module
 * internals, per the E6 boundary rule (`../<module>/index` is allowed).
 */
export { AuditModule } from './audit.module';
export { AuditService } from './audit.service';
export type { AuditActorType, AuditEntry, AuditRequestContext } from './audit.service';
