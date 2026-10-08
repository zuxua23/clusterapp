import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/permissions.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import { LEVEL_ADMIN } from '../common/helpers';
import {
  CreateRoleDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './rbac.dto';

@Injectable()
export class RbacService {
  constructor(
    private prisma: PrismaService,
    private permissions: PermissionsService,
    private audit: AuditService,
  ) {}

  // ================================================================
  // ROLE
  // ================================================================

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: [{ level: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { users: true, permissions: true } } },
    });
  }

  async createRole(actor: AuthUser, dto: CreateRoleDto) {
    const exists = await this.prisma.role.findUnique({
      where: { kode: dto.kode },
    });
    if (exists)
      throw new ConflictException(`Kode peran ${dto.kode} sudah dipakai.`);

    const role = await this.prisma.role.create({
      data: {
        kode: dto.kode,
        nama: dto.nama.trim(),
        level: dto.level,
        isSystem: false,
      },
    });
    await this.audit.catat(actor.sub, 'role.buat', {
      target: 'Role',
      targetId: role.id,
      keterangan: `${role.kode} (${role.nama})`,
    });
    return {
      message: 'Peran berhasil dibuat. Atur hak aksesnya di matriks.',
      data: role,
    };
  }

  async updateRole(actor: AuthUser, id: number, dto: UpdateRoleDto) {
    const role = await this.findRole(id);
    if (role.isSystem && dto.level !== undefined && dto.level !== role.level) {
      throw new BadRequestException('Tingkat peran bawaan tidak dapat diubah.');
    }
    const data = await this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.nama !== undefined && { nama: dto.nama.trim() }),
        ...(dto.level !== undefined && { level: dto.level }),
      },
    });
    await this.audit.catat(actor.sub, 'role.ubah', {
      target: 'Role',
      targetId: id,
    });
    return { message: 'Peran berhasil diperbarui.', data };
  }

  async removeRole(actor: AuthUser, id: number) {
    const role = await this.findRole(id);
    if (role.isSystem)
      throw new BadRequestException('Peran bawaan tidak dapat dihapus.');

    const pemakai = await this.prisma.user.count({ where: { roleId: id } });
    if (pemakai > 0) {
      throw new BadRequestException(
        `Peran ini masih dipakai ${pemakai} akun. Pindahkan akunnya dulu sebelum menghapus.`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
    this.permissions.invalidate(id);
    await this.audit.catat(actor.sub, 'role.hapus', {
      target: 'Role',
      targetId: id,
      keterangan: role.kode,
    });
    return { message: 'Peran berhasil dihapus.' };
  }

  private async findRole(id: number) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role)
      throw new NotFoundException(`Peran dengan ID ${id} tidak ditemukan.`);
    return role;
  }

  // ================================================================
  // PERMISSION & MATRIKS
  // ================================================================

  listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ menu: 'asc' }, { id: 'asc' }],
    });
  }

  /** Semua yang dibutuhkan menu matriks dalam satu panggilan: role x permission + scope. */
  async matrix() {
    const [roles, permissions, grants] = await Promise.all([
      this.listRoles(),
      this.listPermissions(),
      this.prisma.rolePermission.findMany({
        select: {
          roleId: true,
          scope: true,
          permission: { select: { kode: true } },
        },
      }),
    ]);

    const perRole: Record<number, Record<string, string>> = {};
    for (const g of grants) {
      (perRole[g.roleId] ??= {})[g.permission.kode] = g.scope;
    }
    return { roles, permissions, grants: perRole };
  }

  async getRolePermissions(roleId: number) {
    await this.findRole(roleId);
    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { scope: true, permission: true },
    });
    return rows.map((r) => ({ ...r.permission, scope: r.scope }));
  }

  /** Ganti seluruh permission sebuah role sekaligus (yang tidak dikirim dicabut). */
  async setRolePermissions(
    actor: AuthUser,
    roleId: number,
    dto: SetRolePermissionsDto,
  ) {
    const role = await this.findRole(roleId);
    if (role.level === LEVEL_ADMIN) {
      // Kalau admin bisa mencabut aksesnya sendiri, tidak ada lagi yang bisa memperbaiki matriks.
      throw new ForbiddenException('Hak akses Admin tidak dapat diubah.');
    }

    const kodeList = [...new Set(dto.grants.map((g) => g.kode))];
    const perms = await this.prisma.permission.findMany({
      where: { kode: { in: kodeList } },
    });
    const idByKode = new Map(perms.map((p) => [p.kode, p.id]));
    const tidakDikenal = kodeList.filter((k) => !idByKode.has(k));
    if (tidakDikenal.length > 0) {
      throw new BadRequestException(
        `Hak akses tidak dikenal: ${tidakDikenal.join(', ')}`,
      );
    }

    // Kalau kode dikirim ganda, yang terakhir menang.
    const scopeByKode = new Map(dto.grants.map((g) => [g.kode, g.scope]));

    const sebelum = await this.prisma.rolePermission.count({
      where: { roleId },
    });
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: [...scopeByKode].map(([kode, scope]) => ({
          roleId,
          permissionId: idByKode.get(kode)!,
          scope,
          createBy: actor.nama,
        })),
      }),
    ]);
    this.permissions.invalidate(roleId);

    await this.audit.catat(actor.sub, 'role.ubah_permission', {
      target: 'Role',
      targetId: roleId,
      keterangan: `${role.kode}: ${sebelum} -> ${scopeByKode.size} hak akses`,
    });
    return {
      message: `Hak akses ${role.nama} berhasil disimpan (${scopeByKode.size} hak akses).`,
    };
  }

  // ================================================================
  // AUDIT
  // ================================================================

  async auditLog(limit = 100) {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              rows.map((r) => r.idUser).filter((v): v is number => v !== null),
            ),
          ],
        },
      },
      select: { id: true, namaUser: true },
    });
    const nama = new Map(users.map((u) => [u.id, u.namaUser]));
    return rows.map((r) => ({
      ...r,
      pelaku: r.idUser ? (nama.get(r.idUser) ?? null) : null,
    }));
  }
}
