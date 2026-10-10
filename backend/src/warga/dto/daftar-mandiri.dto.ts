import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { RT } from '@prisma/client';
import { NAMA_MESSAGE, NAMA_REGEX } from '../../common/helpers';

const blank = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

/** Registrasi mandiri warga (Bagian 3) — masuk status Menunggu Persetujuan, bukan langsung aktif. */
export class DaftarMandiriDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(NAMA_REGEX, { message: NAMA_MESSAGE })
  namaUser!: string;

  @IsString()
  @IsNotEmpty()
  noTelp!: string;

  @IsOptional()
  @IsEmail()
  @Transform(blank)
  email?: string;

  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter' })
  password!: string;

  @IsEnum(RT)
  @IsNotEmpty()
  rt!: RT;

  /** Rumah yang dipilih dari daftar kosong (GET /warga/rumah-kosong), bukan teks bebas. */
  @IsInt()
  rumahId!: number;
}
