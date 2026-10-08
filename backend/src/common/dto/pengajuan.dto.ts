import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** Keputusan ketua/sekre RW atas kegiatan/pengumuman yang diajukan RT. */
export class KeputusanPengajuanDto {
  @IsIn(['SETUJU', 'TOLAK'])
  action: 'SETUJU' | 'TOLAK';

  /** Wajib bila TOLAK. */
  @IsOptional()
  @IsString()
  alasan?: string;

  /** Berapa hari tampil di dashboard warga; 0 atau kosong = tanpa batas. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durasiHari?: number;
}
