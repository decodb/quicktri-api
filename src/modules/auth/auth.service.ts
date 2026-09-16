import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { SignUpDto } from './dto/signup.dto';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { MailService } from 'src/core/mail/mail.service';
import { MailTemplate } from 'src/core/mail/mail.types';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  async signUp(dto: SignUpDto) {
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

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const verifyLink = `${frontendUrl}/verify-email?token=${token}`;

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

  async verifyEmail(token: string) {
    const hashToken = crypto.createHash('sha256').update(token).digest('hex');

    const emailVerificationToken =
      await this.prisma.emailVerificationToken.findUnique({
        where: { token: hashToken },
        include: { user: true },
      });

    const now = new Date();

    if (
      !emailVerificationToken ||
      emailVerificationToken.isUsed ||
      now > new Date(emailVerificationToken.expiresAt)
    ) {
      throw new BadRequestException('Missing or invalid token. ');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: emailVerificationToken.userId },
        data: { isVerified: true },
      }),
      this.prisma.emailVerificationToken.delete({
        where: { token: hashToken },
      }),
    ]);

    return { message: 'Email verified. You may continue to login.' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
      const resetLink = `${frontendUrl}/reset-password?token=${token}`;

      await this.prisma.forgotPasswordToken.create({
        data: {
          token: tokenHash,
          usedAt: null,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          userId: user.id,
        },
      });

      await this.mail.sendMail({
        to: dto.email,
        template: MailTemplate.FORGOT_PASSWORD,
        context: {
          firstName: user.firstName,
          resetLink,
        },
      });
    }

    return {
      message:
        'If an account with that email exists, a reset link has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const incomingHashToken = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');

    const forgotPasswordToken =
      await this.prisma.forgotPasswordToken.findUnique({
        where: { token: incomingHashToken },
        select: {
          id: true,
          isUsed: true,
          expiresAt: true,
          userId: true,
          user: {
            select: {
              firstName: true,
              email: true,
            },
          },
        },
      });

    if (
      !forgotPasswordToken ||
      forgotPasswordToken.isUsed ||
      new Date() > new Date(forgotPasswordToken.expiresAt)
    ) {
      throw new BadRequestException('Invalid or expired token.');
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      Number(this.config.getOrThrow<string>('PASSWORD_SALT_ROUNDS')),
    );

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: forgotPasswordToken.userId },
        data: {
          passwordHash,
        },
      }),
      this.prisma.forgotPasswordToken.update({
        where: { id: forgotPasswordToken.id },
        data: {
          isUsed: true,
          usedAt: new Date(),
        },
      }),
    ]);

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const loginLink = `${frontendUrl}/sign-in`;

    try {
      await this.mail.sendMail({
        to: forgotPasswordToken.user.email,
        template: MailTemplate.RESET_PASSWORD_SUCCESS,
        context: {
          firstName: forgotPasswordToken.user.firstName,
          resetDate: new Date().toDateString(),
          resetTime: new Date().toLocaleTimeString(),
          loginLink,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send password reset confirmation email to ${forgotPasswordToken.user.email}`,
        error,
      );
    }

    return { message: 'Password successfully changed.' };
  }
}
