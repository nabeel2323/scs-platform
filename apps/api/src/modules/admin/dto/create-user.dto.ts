import { z } from 'zod';

export const CreateUserDtoSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(160, 'Full name must not exceed 160 characters'),
  email: z.string().email('Invalid email address').max(254, 'Email must not exceed 254 characters'),
  phone: z.string().min(1, 'Phone number is required').max(20, 'Phone number must not exceed 20 characters').optional(),
  locale: z.string().min(2, 'Locale is required').max(10, 'Locale must not exceed 10 characters').default('en'),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']).default('ACTIVE'),
  orgId: z.string().uuid('Invalid organization ID').optional(),
  roleId: z.string().uuid('Invalid role ID').optional(),
});

export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;
