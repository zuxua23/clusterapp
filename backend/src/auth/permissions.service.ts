import { Injectable } from '@nestjs/common';
import { ScopeAkses } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth.types';

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
  private userCache = new Map<number, { at: number; user: AuthUser }>();

  constructor(private prisma: PrismaService) {}

  async userById(id: number): Promise<AuthUser | null> {
    const cached = this.userCache.get(id);
    if (cached && Date.now() - cached.at < PermissionsService.USER_TTL_MS)
      return cached.user;

    const row = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        namaUser: true,
        area: true,
        roleId: true,
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
    this.userCache.set(id, { at: Date.now(), user });
    return user;
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
