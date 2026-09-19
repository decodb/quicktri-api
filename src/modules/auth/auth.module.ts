import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MailModule } from 'src/core/mail/mail.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    MailModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_ACCESS_SECRET,
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
