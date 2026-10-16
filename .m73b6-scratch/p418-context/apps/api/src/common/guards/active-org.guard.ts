import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { organizations } from '../../modules/identity/identity.schema';
import type { JwtPayload } from './current-user.decorator';

/**
 * ActiveOrgGuard — enforces the organization soft-delete flag (is_active).
 *
 * Applied to merchant write endpoints so a deactivated organization loses
 * platform write access while data is preserved. Reads remain allowed so
 * merchants can still view their organization page and the deactivation
 * banner. Requests without an `activeOrg` claim (e.g. buyers, or platform
 * admins acting outside an org context) pass through — their access is
 * governed by the permission guards instead.
 *
 * Must run AFTER JwtAuthGuard (reads `request.user`).
 */
@Injectable()
export class ActiveOrgGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (!user?.activeOrg) return true;

    const org = await this.db.db.query.organizations.findFirst({
      where: eq(organizations.id, user.activeOrg),
      columns: { id: true, isActive: true },
    });
    if (org && !org.isActive) {
      throw new ForbiddenException(
        'Organization is deactivated. Contact support for assistance.',
      );
    }
    return true;
  }
}
