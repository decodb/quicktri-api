import { Role } from 'src/generated/prisma/enums';

export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
}
