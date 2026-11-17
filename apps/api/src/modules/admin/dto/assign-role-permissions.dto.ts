import { z } from 'zod';

export const AssignRolePermissionsDtoSchema = z.object({
  permissionIds: z.array(z.string().uuid('Invalid permission ID')).min(1, 'At least one permission is required'),
});

export type AssignRolePermissionsDto = z.infer<typeof AssignRolePermissionsDtoSchema>;
