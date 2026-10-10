import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PermissionsService } from './permissions.service';
import { AuthedRequest } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Token tidak ditemukan.');
    }

    let payload: { sub: number; pv?: string };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException(
        'Token tidak valid atau sudah kedaluwarsa.',
      );
    }

    // Role & area dibaca dari DB (di-cache singkat), bukan dari token, supaya
    // perubahan jabatan oleh admin cepat berlaku.
    const sesi = await this.permissions.sesiUser(payload.sub);
    if (!sesi) {
      throw new UnauthorizedException('Akun tidak ditemukan.');
    }
    if (payload.pv !== sesi.pv) {
      throw new UnauthorizedException(
        'Kata sandi sudah diganti. Silakan masuk kembali.',
      );
    }
    request.user = sesi.user;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
