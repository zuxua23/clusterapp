import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

export interface PushPayload {
  title: string;
  body: string;
  url?: string | null;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    } else {
      this.logger.warn(
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT belum di-set — push notification nonaktif.',
      );
    }
  }

  vapidPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null };
  }

  async subscribe(idUser: number, dto: SubscribePushDto, userAgent?: string) {
    await this.prisma.pushSubscription.upsert({
      where: { idUser_endpoint: { idUser, endpoint: dto.endpoint } },
      create: {
        idUser,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent,
      },
      update: {
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent,
      },
    });
    return { message: 'Notifikasi push diaktifkan.' };
  }

  async unsubscribe(idUser: number, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { idUser, endpoint },
    });
    return { message: 'Notifikasi push dimatikan.' };
  }

  /** Kirim push ke satu user (semua device/subscription miliknya). Tidak pernah throw —
   * dipanggil fire-and-forget dari NotifikasiService supaya gagal kirim push tidak
   * mengganggu alur utama (pembuatan notifikasi in-app). */
  async kirimKeUser(idUser: number, payload: PushPayload) {
    return this.kirimKeBanyak([idUser], payload);
  }

  async kirimKeBanyak(idUserList: number[], payload: PushPayload) {
    if (!process.env.VAPID_PRIVATE_KEY || idUserList.length === 0) return;
    const unique = [...new Set(idUserList)];
    const subs = await this.prisma.pushSubscription.findMany({
      where: { idUser: { in: unique } },
    });
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
    });

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
        } catch (err) {
          // 404/410 = subscription sudah tidak valid (user uninstall/clear data/dll) — bersihkan.
          const statusCode =
            err instanceof webpush.WebPushError ? err.statusCode : undefined;
          if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { id: sub.id } })
              .catch(() => undefined);
          } else {
            this.logger.warn(
              `Gagal kirim push ke subscription ${sub.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }),
    );
  }
}
