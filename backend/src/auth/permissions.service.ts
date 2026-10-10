import { Injectable } from '@nestjs/common';
import { ScopeAkses } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth.types';
import { sidikPassword } from './sidik-password';

/** Cache hak akses & user login di memori supaya tidak query DB di tiap request. */
@Injectable()
export class PermissionsService {
  // TTL supaya perubahan langsung di DB (mis. lewat SQL) tetap terbaca.
  private static readonly TTL_MS = 30_000;
  private static readonly USER_TTL_MS = 15_000;
  private cache = new Map<
    number,
    { at: number; grants: Map<string, ScopeAkses> }
  >();
  private userCache = new Map<
    number,
    { at: number; sesi: { user: AuthUser; pv: string } }
  >();

  constructor(private prisma: PrismaService) {}

  /** User login + sidik password-nya (untuk mencocokkan token). */
  async sesiUser(id: number): Promise<{ user: AuthUser; pv: string } | null> {
    const cached = this.userCache.get(id);
    if (cached && Date.now() - cached.at < PermissionsService.USER_TTL_MS)
      return cached.sesi;

    const row = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        namaUser: true,
        area: true,
        roleId: true,
        password: true,
        role: { select: { kode: true } },
      },
    });
    if (!row) {
      this.userCache.delete(id);
      return null;
    }
    const user: AuthUser = {
      sub: row.id,
      username: row.username,
      nama: row.namaUser,
      role: row.role.kode,
      roleId: row.roleId,
      area: row.area,
    };
    const sesi = { user, pv: sidikPassword(row.password) };
    this.userCache.set(id, { at: Date.now(), sesi });
    return sesi;
  }

  invalidateUser(id?: number) {
    if (id === undefined) this.userCache.clear();
    else this.userCache.delete(id);
  }

  async forRole(roleId: number): Promise<Map<string, ScopeAkses>> {
    const cached = this.cache.get(roleId);
    if (cached && Date.now() - cached.at < PermissionsService.TTL_MS)
      return cached.grants;

    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { scope: true, permission: { select: { kode: true } } },
    });
    const map = new Map(rows.map((r) => [r.permission.kode, r.scope]));
    this.cache.set(roleId, { at: Date.now(), grants: map });
    return map;
  }

  /** Scope permission untuk role ini, atau null kalau role tidak punya permission itu. */
  async scopeOf(roleId: number, kode: string): Promise<ScopeAkses | null> {
    return (await this.forRole(roleId)).get(kode) ?? null;
  }

  async toObject(roleId: number): Promise<Record<string, ScopeAkses>> {
    return Object.fromEntries(await this.forRole(roleId));
  }

  invalidate(roleId?: number) {
    if (roleId === undefined) this.cache.clear();
    else this.cache.delete(roleId);
  }
}
