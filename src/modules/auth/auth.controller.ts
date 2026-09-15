import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { SignUpDto } from './dto/signup.dto';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}
  @Post('sign-up')
  signUp(@Body() dto: SignUpDto): Promise<{ email }> {
    return this.authService.signUp(dto);
  }

  @Get('/verify-email')
  verifyEmail(@Query('token') token: string) {
    if (!token) {
      return new BadRequestException('Token missing or invalid. ');
    }

    return this.authService.verifyEmail(token);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }
}
