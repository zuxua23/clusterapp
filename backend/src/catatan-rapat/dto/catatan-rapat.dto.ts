import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { Area } from '@prisma/client';

export class CreateCatatanRapatDto {
  @IsString()
  @IsNotEmpty()
  judul!: string;

  /** Boleh kosong HANYA kalau ada file notulen yang diunggah — divalidasi di service,
   * karena butuh tahu apakah file ikut terkirim (tidak bisa dicek lewat DTO saja). */
  @IsString()
  @IsOptional()
  isiNotulen?: string;

  /**
   * Tidak ada pilihan kategori: area ditentukan otomatis dari jabatan pembuat
   * (sekre RW -> RW, sekre RT2 -> RT_02). Hanya admin (scope ALL) yang boleh menentukan.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsEnum(Area)
  area?: Area;
}

export class UpdateCatatanRapatDto extends PartialType(CreateCatatanRapatDto) {
  /** Dikirim saat user pindah mode dari gambar/file ke isi notulen tanpa mengunggah file baru —
   * melepas file lama. Datang sebagai string "true"/"false" dari FormData. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hapusFile?: boolean;
}
