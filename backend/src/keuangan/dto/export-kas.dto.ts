import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Query params GET /keuangan/export — filter sama seperti tabel Riwayat Kas. */
export class ExportKasDto {
  @IsIn(['csv', 'xlsx'], { message: 'format harus csv atau xlsx' })
  format: 'csv' | 'xlsx';

  @IsOptional()
  @Matches(YM, { message: 'dari harus format YYYY-MM, contoh 2026-01' })
  dari?: string;

  @IsOptional()
  @Matches(YM, { message: 'sampai harus format YYYY-MM, contoh 2026-09' })
  sampai?: string;

  @IsOptional()
  @IsString()
  tipe?: string;

  @IsOptional()
  @IsString()
  kategori?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  area?: string;

  /** Saldo awal sebelum baris pertama (default 0). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'saldoAwal harus angka' })
  saldoAwal?: number;
}
