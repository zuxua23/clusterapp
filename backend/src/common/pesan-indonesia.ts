import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ValidationError,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Seluruh pesan error yang sampai ke warga harus berbahasa Indonesia. Pesan buatan
 * aplikasi sudah Indonesia; file ini menerjemahkan yang berasal dari pustaka
 * (class-validator, NestJS, multer) yang bawaannya berbahasa Inggris.
 */

// Nama field (camelCase di DTO) -> nama yang wajar dibaca pengguna
const LABEL: Record<string, string> = {
  nama: 'Nama',
  no_hp: 'No. HP',
  noTelp: 'No. HP',
  kontak: 'Nomor kontak',
  rt: 'RT',
  blokRumah: 'Blok rumah',
  statusRumah: 'Status rumah',
  username: 'Nama pengguna',
  email: 'Email',
  password: 'Kata sandi',
  passwordLama: 'Kata sandi lama',
  passwordBaru: 'Kata sandi baru',
  judul: 'Judul',
  deskripsi: 'Deskripsi',
  tanggalAcara: 'Tanggal acara',
  keteranganPengumuman: 'Keterangan',
  isiNotulen: 'Isi notulen',
  nominal: 'Nominal',
  nominalIpl: 'Nominal IPL',
  nominalKas: 'Nominal kas',
  bulanPeriode: 'Bulan periode',
  tahunPeriode: 'Tahun periode',
  kategori: 'Kategori',
  tipe: 'Tipe',
  tanggal: 'Tanggal',
  keterangan: 'Keterangan',
  tanggapan: 'Tanggapan',
  status: 'Status',
  action: 'Aksi',
  catatan: 'Catatan',
  alasan: 'Alasan',
  durasiHari: 'Durasi tampil (hari)',
  tampilDiLanding: 'Tampil di portofolio',
  area: 'Wilayah',
  kode: 'Kode',
  level: 'Tingkat',
  roleId: 'Peran',
  userId: 'Pengguna',
  grants: 'Daftar hak akses',
  scope: 'Jangkauan akses',
};

const label = (properti: string) => LABEL[properti] ?? properti;
const angka = (pesan: string) => pesan.match(/(\d+)/)?.[1] ?? '';

// Kunci constraint class-validator -> kalimat Indonesia
const TEMPLATE: Record<string, (l: string, pesanAsli: string) => string> = {
  isNotEmpty: (l) => `${l} wajib diisi`,
  isDefined: (l) => `${l} wajib diisi`,
  isString: (l) => `${l} harus berupa teks`,
  isEmail: (l) => `Format ${l.toLowerCase()} tidak valid`,
  isEnum: (l) => `${l} tidak valid`,
  isIn: (l) => `${l} tidak valid`,
  isInt: (l) => `${l} harus berupa bilangan bulat`,
  isNumber: (l) => `${l} harus berupa angka`,
  isPositive: (l) => `${l} harus lebih dari 0`,
  isBoolean: (l) => `${l} harus berupa ya/tidak`,
  isArray: (l) => `${l} harus berupa daftar`,
  arrayMaxSize: (l) => `${l} terlalu banyak isinya`,
  isDateString: (l) => `${l} harus berupa tanggal yang valid`,
  matches: (l) => `Format ${l.toLowerCase()} tidak valid`,
  min: (l, p) => `${l} minimal ${angka(p)}`,
  max: (l, p) => `${l} maksimal ${angka(p)}`,
  minLength: (l, p) => `${l} minimal ${angka(p)} karakter`,
  maxLength: (l, p) => `${l} maksimal ${angka(p)} karakter`,
};

// Pesan bawaan class-validator berbahasa Inggris; pesan buatan kita (Indonesia) dibiarkan.
const POLA_INGGRIS =
  /\b(should|must|is not|has to|be a|be an|longer|shorter)\b/i;

function ratakan(errors: ValidationError[], induk = ''): string[] {
  return errors.flatMap((e) => {
    const nama = induk ? `${induk}.${e.property}` : e.property;
    const sendiri = Object.entries(e.constraints ?? {}).map(([kunci, pesan]) =>
      !POLA_INGGRIS.test(pesan)
        ? pesan
        : (TEMPLATE[kunci]?.(label(e.property), pesan) ??
          `${label(e.property)} tidak valid`),
    );
    return [...sendiri, ...ratakan(e.children ?? [], nama)];
  });
}

/** Dipakai ValidationPipe: bentuk respons sama dengan bawaan Nest, isinya Indonesia. */
export const validasiIndonesia = (errors: ValidationError[]) =>
  new BadRequestException(ratakan(errors));

// Pesan umum NestJS/multer -> Indonesia
const TERJEMAHAN: Array<[RegExp, string]> = [
  [
    /^unauthorized$/i,
    'Anda belum masuk atau sesi sudah berakhir. Silakan masuk kembali.',
  ],
  [/^forbidden( resource)?$/i, 'Anda tidak memiliki akses untuk aksi ini.'],
  [/^not found$/i, 'Data atau halaman tidak ditemukan.'],
  [
    /^cannot (get|post|put|patch|delete) /i,
    'Alamat yang diminta tidak ditemukan.',
  ],
  [/^bad request$/i, 'Permintaan tidak valid.'],
  [/^conflict$/i, 'Data bentrok dengan data yang sudah ada.'],
  [/^internal server error$/i, 'Terjadi kesalahan pada server.'],
  [
    /^validation failed \(numeric string is expected\)/i,
    'ID harus berupa angka.',
  ],
  [/^validation failed/i, 'Data yang dikirim tidak valid.'],
  [/^file too large$/i, 'Ukuran file terlalu besar.'],
  [/^payload too large$/i, 'Ukuran data terlalu besar.'],
  [/^unexpected field/i, 'File yang dikirim tidak dikenali.'],
  [
    /(unexpected token|expected property name|in json at position|is not valid json|unexpected end of json)/i,
    'Format data yang dikirim tidak valid.',
  ],
  [
    /^too many (requests|files)/i,
    'Terlalu banyak permintaan. Coba lagi sebentar lagi.',
  ],
];

const terjemahkan = (pesan: string) =>
  TERJEMAHAN.find(([pola]) => pola.test(pesan))?.[1] ?? pesan;

@Catch()
export class PesanIndonesiaFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const asli =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);
      const message = Array.isArray(asli)
        ? asli.map(terjemahkan)
        : terjemahkan(asli);
      return res.status(status).json({
        statusCode: status,
        message,
        error: HttpStatus[status] ?? undefined,
      });
    }

    this.logger.error(
      exception instanceof Error
        ? (exception.stack ?? exception.message)
        : String(exception),
    );
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: 'Terjadi kesalahan pada server.',
      error: 'INTERNAL_SERVER_ERROR',
    });
  }
}
