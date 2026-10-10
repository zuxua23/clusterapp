import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { sidikPassword } from './sidik-password';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from './permissions.service';

export const SALT_ROUNDS = 10;

/** Masa berlaku token bila "Ingat saya" dicentang; selain itu pakai JWT_EXPIRES_IN (default 1d). */
const REMEMBER_EXPIRES_IN = '30d';

const INVALID_CREDENTIALS_MSG = 'Nama pengguna atau kata sandi salah.';

// Hash dummy supaya login dengan username tak terdaftar butuh waktu sama (tidak bisa dipakai menebak username).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-tidak-dipakai', SALT_ROUNDS);

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
    const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
    if (!user || !valid)
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);

    return {
      message: 'Login berhasil',
      token: await this.buatToken(user, remember),
      user: await this.profile(user.id),
    };
  }

  private buatToken(
    user: { id: number; username: string; password: string },
    remember: boolean,
  ) {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        username: user.username,
        pv: sidikPassword(user.password),
      },
      remember ? { expiresIn: REMEMBER_EXPIRES_IN } : undefined,
    );
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
    remember = false,
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

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(passwordBaru, SALT_ROUNDS),
        wajibGantiPassword: false,
      },
      select: { id: true, username: true, password: true },
    });
    this.permissions.invalidateUser(userId);
    await this.audit.catat(userId, 'password.ganti', {
      target: 'User',
      targetId: userId,
    });

    // Token lama ikut batal (sidik password berubah), jadi kirim token baru untuk sesi ini.
    return {
      message: 'Kata sandi berhasil diganti.',
      token: await this.buatToken(updated, remember),
    };
  }
}
