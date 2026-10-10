import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { RT, StatusRumah } from '@prisma/client';
import {
  BLOK_RUMAH_MESSAGE,
  BLOK_RUMAH_REGEX,
  NAMA_MESSAGE,
  NAMA_REGEX,
} from '../../common/helpers';

const blank = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class CreateWargaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(NAMA_REGEX, { message: NAMA_MESSAGE })
  nama!: string;

  @IsString()
  @IsNotEmpty()
  no_hp!: string;

  @IsEnum(RT)
  @IsNotEmpty()
  rt!: RT;

  @IsString()
  @IsNotEmpty()
  @Matches(BLOK_RUMAH_REGEX, { message: BLOK_RUMAH_MESSAGE })
  blokRumah!: string;

  /** Login. Kosong = pakai no HP. */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @Transform(blank)
  username?: string;

  /** Opsional; banyak warga tidak punya email. */
  @IsOptional()
  @IsEmail()
  @Transform(blank)
  email?: string;

  /** Kosong = dibuatkan otomatis dan dikembalikan sekali di response. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Transform(blank)
  password?: string;

  // KOSONG berarti tidak dihuni tetapi tetap ada pemilik/penanggung jawab IPL
  // (rumah kosong sudah pasti terjual; tagihannya masuk kas RT).
  @IsOptional()
  @IsEnum(StatusRumah)
  @Transform(blank)
  statusRumah?: StatusRumah;
}
