import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Area, StatusKegiatan } from '@prisma/client';

const kosongJadiUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;
const keBoolean = ({ value }: { value: unknown }) =>
  value === '' || value === undefined
    ? undefined
    : value === true || value === 'true';

export class CreateKegiatanDto {
  @IsString()
  @IsNotEmpty()
  judul!: string;

  @IsString()
  @IsNotEmpty()
  deskripsi!: string;

  @IsDateString()
  @IsNotEmpty()
  tanggalAcara!: string;

  @IsEnum(StatusKegiatan)
  @IsOptional()
  status?: StatusKegiatan;

  /** Hanya dipakai user ber-scope ALL (admin). Selain itu area otomatis dari jabatan. */
  @IsOptional()
  @Transform(kosongJadiUndefined)
  @IsEnum(Area)
  area?: Area;

  /** Khusus pengurus yang berhak menyetujui (ketua/sekre RW): tampil di portofolio landing page. */
  @IsOptional()
  @Transform(keBoolean)
  @IsBoolean()
  tampilDiLanding?: boolean;

  /** Khusus pengurus yang berhak menyetujui: berapa hari tampil di dashboard warga (0 = tanpa batas). */
  @IsOptional()
  @Transform(kosongJadiUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durasiHari?: number;
}
