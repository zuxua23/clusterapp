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
import { PrismaService } from '../prisma/prisma.service';
import { AuthedRequest } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
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

    let sub: number;
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: number }>(token);
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException(
        'Token tidak valid atau sudah kedaluwarsa.',
      );
    }

    // Role dan area dibaca dari DB tiap request, bukan dari token, supaya
    // perubahan jabatan oleh admin langsung berlaku tanpa menunggu token habis.
    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      select: {
        id: true,
        username: true,
        namaUser: true,
        area: true,
        roleId: true,
        role: { select: { kode: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('Akun tidak ditemukan.');
    }

    request.user = {
      sub: user.id,
      username: user.username,
      nama: user.namaUser,
      role: user.role.kode,
      roleId: user.roleId,
      area: user.area,
    };
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
