import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Area, ScopeAkses, TipeNotifikasi } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

const punyaPermission = (kode: string, scope: ScopeAkses[]) => ({
  role: {
    permissions: { some: { permission: { kode }, scope: { in: scope } } },
  },
});

const RETENSI_SETELAH_DIBACA_MS = 24 * 60 * 60 * 1000; // 1 hari

@Injectable()
export class NotifikasiService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotifikasiService.name);

  constructor(
    private prisma: PrismaService,
    private pushService: PushService,
  ) {}

  /** Job pembersih juga jalan sekali saat start, supaya keterlambatan (backend sempat mati) terkejar. */
  onApplicationBootstrap() {
    this.hapusNotifikasiDibaca().catch((err) =>
      this.logger.error(
        'Gagal menjalankan pembersihan notifikasi saat start',
        err,
      ),
    );
  }

  /** Notifikasi yang sudah ditandai dibaca otomatis dihapus 1 hari kemudian — biar tabel
   * tb_Notifikasi tidak menumpuk tanpa batas. Yang belum dibaca tidak pernah dihapus otomatis. */
  @Cron(CronExpression.EVERY_HOUR)
  async hapusNotifikasiDibaca() {
    const batas = new Date(Date.now() - RETENSI_SETELAH_DIBACA_MS);
    const { count } = await this.prisma.notifikasi.deleteMany({
      where: { isRead: true, readAt: { lte: batas } },
    });
    if (count > 0)
      this.logger.log(
        `Menghapus ${count} notifikasi yang sudah dibaca >1 hari.`,
      );
  }

  /** Lempar push notification tanpa ditunggu (fire-and-forget) — kalau gagal, cukup
   * di-log, tidak boleh bikin pembuatan notifikasi in-app (pemanggil method ini) ikut gagal. */
  private kirimPush(
    idUserList: number[],
    judul: string,
    pesan: string,
    link?: string | null,
  ) {
    this.pushService
      .kirimKeBanyak(idUserList, { title: judul, body: pesan, url: link })
      .catch((err: unknown) =>
        this.logger.warn(
          `Gagal kirim push notification: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  async kirim(
    idUser: number,
    tipe: TipeNotifikasi,
    judul: string,
    pesan: string,
    link?: string,
  ) {
    const data = await this.prisma.notifikasi.create({
      data: { idUser, tipe, judul, pesan, link },
    });
    this.kirimPush([idUser], judul, pesan, link);
    return data;
  }

  async kirimBanyak(
    idUserList: number[],
    tipe: TipeNotifikasi,
    judul: string,
    pesan: string,
    link?: string,
  ) {
    const unique = [...new Set(idUserList)];
    if (unique.length === 0) return Promise.resolve();
    const data = await this.prisma.notifikasi.createMany({
      data: unique.map((idUser) => ({ idUser, tipe, judul, pesan, link })),
    });
    this.kirimPush(unique, judul, pesan, link);
    return data;
  }

  /** Kirim ke pemegang permission `kode`: ALL selalu, AREA bila areanya cocok. Area kosong/RW = seluruh RW. */
  async kirimKePermission(
    kode: string,
    area: Area | null | undefined,
    tipe: TipeNotifikasi,
    judul: string,
    pesan: string,
    link?: string,
    kecualiUserId?: number,
  ) {
    const seluruhRw = !area || area === 'RW';
    const users = await this.prisma.user.findMany({
      where: {
        ...(kecualiUserId !== undefined && { id: { not: kecualiUserId } }),
        OR: seluruhRw
          ? [punyaPermission(kode, ['ALL', 'AREA', 'OWN'])]
          : [
              punyaPermission(kode, ['ALL']),
              { area, ...punyaPermission(kode, ['AREA', 'OWN']) },
            ],
      },
      select: { id: true },
    });
    return this.kirimBanyak(
      users.map((u) => u.id),
      tipe,
      judul,
      pesan,
      link,
    );
  }

  /** Seperti `kirimKePermission` tapi area dicocokkan persis (RW bukan berarti semua) — untuk pengaduan. */
  async kirimKePermissionAreaPersis(
    kode: string,
    area: Area,
    tipe: TipeNotifikasi,
    judul: string,
    pesan: string,
    link?: string,
    kecualiUserId?: number,
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        ...(kecualiUserId !== undefined && { id: { not: kecualiUserId } }),
        OR: [
          punyaPermission(kode, ['ALL']),
          { area, ...punyaPermission(kode, ['AREA', 'OWN']) },
        ],
      },
      select: { id: true },
    });
    return this.kirimBanyak(
      users.map((u) => u.id),
      tipe,
      judul,
      pesan,
      link,
    );
  }

  findByUser(userId: number) {
    return this.prisma.notifikasi.findMany({
      where: { idUser: userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  async markRead(id: number, userId: number) {
    const notif = await this.prisma.notifikasi.findUnique({ where: { id } });
    if (!notif) {
      throw new NotFoundException(`Notifikasi dengan ID ${id} tidak ditemukan`);
    }
    if (notif.idUser !== userId) {
      throw new ForbiddenException('Anda tidak berhak mengubah notifikasi ini');
    }
    return this.prisma.notifikasi.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: number) {
    await this.prisma.notifikasi.updateMany({
      where: { idUser: userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { message: 'Semua notifikasi ditandai sudah dibaca' };
  }
}
