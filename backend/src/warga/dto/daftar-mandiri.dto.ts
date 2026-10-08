import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { RT } from '@prisma/client';

const blank = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

/** Registrasi mandiri warga (Bagian 3) — masuk status Menunggu Persetujuan, bukan langsung aktif. */
export class DaftarMandiriDto {
  @IsString()
  @IsNotEmpty()
  namaUser!: string;

  @IsString()
  @IsNotEmpty()
  noTelp!: string;

  @IsOptional()
  @IsEmail()
  @Transform(blank)
  email?: string;

  @IsString()
  @MinLength(6, { message: 'Kata sandi minimal 6 karakter' })
  password!: string;

  @IsEnum(RT)
  @IsNotEmpty()
  rt!: RT;

  /** Rumah yang dipilih dari daftar kosong (GET /warga/rumah-kosong), bukan teks bebas. */
  @IsInt()
  rumahId!: number;
}
