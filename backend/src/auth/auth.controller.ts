import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { CurrentUser } from './permission.decorators';
import type { AuthUser } from './auth.types';

class LoginDto {
  // `email` diterima sebagai alias supaya klien lama tidak langsung rusak.
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /** Centang "Ingat saya": token berlaku lebih lama (lihat REMEMBER_EXPIRES_IN di AuthService). */
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

class GantiPasswordDto {
  @IsString()
  @IsNotEmpty()
  passwordLama!: string;

  @IsString()
  @MinLength(8, { message: 'Kata sandi baru minimal 8 karakter' })
  passwordBaru!: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

const BATAS_KETAT = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(BATAS_KETAT)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(
      dto.username ?? dto.email ?? '',
      dto.password,
      dto.remember === true,
    );
  }

  /** Profil + permission user yang sedang login. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.profile(user.sub);
  }

  @Throttle(BATAS_KETAT)
  @Post('ganti-password')
  gantiPassword(@CurrentUser() user: AuthUser, @Body() dto: GantiPasswordDto) {
    return this.authService.gantiPassword(
      user.sub,
      dto.passwordLama,
      dto.passwordBaru,
      dto.remember === true,
    );
  }
}
