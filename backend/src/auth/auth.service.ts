import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from './permissions.service';

export const SALT_ROUNDS = 10;

/** Masa berlaku token bila "Ingat saya" dicentang; selain itu pakai JWT_EXPIRES_IN (default 1d). */
const REMEMBER_EXPIRES_IN = '30d';

const INVALID_CREDENTIALS_MSG = 'Nama pengguna atau kata sandi salah.';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private permissions: PermissionsService,
    private audit: AuditService,
  ) {}

  async login(identifier: string, password: string, remember = false) {
    const id = identifier?.trim();
    if (!id || !password)
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);

    // Login utama pakai username (default no HP); email tetap diterima bila ada.
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: id }, { email: id }] },
    });
    if (!user) throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);

    const token = await this.jwtService.signAsync(
      { sub: user.id, username: user.username },
      remember ? { expiresIn: REMEMBER_EXPIRES_IN } : undefined,
    );

    return {
      message: 'Login berhasil',
      token,
      user: await this.profile(user.id),
    };
  }

  /** Profil user + seluruh permission role-nya (dipakai frontend untuk menyusun menu). */
  async profile(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { role: true },
    });
    return {
      id: user.id,
      nama: user.namaUser,
      name: user.namaUser,
      username: user.username,
      email: user.email,
      noTelp: user.noTelp,
      role: user.role.kode,
      roleNama: user.role.nama,
      roleLevel: user.role.level,
      area: user.area,
      wajibGantiPassword: user.wajibGantiPassword,
      permissions: await this.permissions.toObject(user.roleId),
    };
  }

  async gantiPassword(
    userId: number,
    passwordLama: string,
    passwordBaru: string,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const valid = await bcrypt.compare(passwordLama, user.password);
    if (!valid) throw new BadRequestException('Kata sandi lama salah.');
    if (passwordBaru === passwordLama) {
      throw new BadRequestException(
        'Kata sandi baru harus berbeda dari kata sandi lama.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(passwordBaru, SALT_ROUNDS),
        wajibGantiPassword: false,
      },
    });
    await this.audit.catat(userId, 'password.ganti', {
      target: 'User',
      targetId: userId,
    });

    return { message: 'Kata sandi berhasil diganti.' };
  }
}
