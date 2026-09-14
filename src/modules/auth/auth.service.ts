import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { SignUpDto } from './dto/signup.dto';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { MailService } from 'src/core/mail/mail.service';
import { MailTemplate } from 'src/core/mail/mail.types';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  async signUp(dto: SignUpDto): Promise<{ email }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException(
        'Email already in use. Please try another email. ',
      );
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      parseInt(this.config.getOrThrow('PASSWORD_SALT_ROUNDS'), 10),
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { newlyCreatedUser, newlyCreatedEmailVerificationToken, token } =
      await this.prisma.$transaction(async (tx) => {
        const newlyCreatedUser = await tx.user.create({
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
            passwordHash,
          },
        });

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto
          .createHash('sha256')
          .update(token)
          .digest('hex');

        const newlyCreatedEmailVerificationToken =
          await tx.emailVerificationToken.upsert({
            where: { userId: newlyCreatedUser.id },
            create: {
              userId: newlyCreatedUser.id,
              token: tokenHash,
              expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
            },
            update: {
              token: tokenHash,
              isUsed: false,
              usedAt: null,
              expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
            },
          });

        return { newlyCreatedUser, newlyCreatedEmailVerificationToken, token };
      });
    const verifyLink = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    await this.mail.sendMail({
      to: newlyCreatedUser.email,
      template: MailTemplate.EMAIL_VERIFICATION,
      context: {
        firstName: newlyCreatedUser.firstName,
        verificationLink: verifyLink,
      },
    });

    return { email: newlyCreatedUser.email };
  }
}
