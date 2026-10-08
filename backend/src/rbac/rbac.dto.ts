import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Area, ScopeAkses } from '@prisma/client';

export class CreateRoleDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,49}$/, {
    message:
      'Kode peran berupa huruf besar/angka/garis bawah, diawali huruf. Contoh: ADMIN_DKM',
  })
  kode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nama!: string;

  /** 1 = level RW, 2 = level RT, 3 = level warga. Level 0 khusus admin bawaan. */
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3], { message: 'Tingkat harus 1 (RW), 2 (RT), atau 3 (warga)' })
  level!: number;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nama?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  level?: number;
}

export class GrantDto {
  @IsString()
  @IsNotEmpty()
  kode!: string;

  @IsEnum(ScopeAkses)
  scope!: ScopeAkses;
}

export class SetRolePermissionsDto {
  /** Daftar lengkap permission yang dimiliki role; yang tidak tercantum dicabut. */
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GrantDto)
  grants!: GrantDto[];
}

export class AssignPengurusDto {
  @Type(() => Number)
  @IsInt()
  roleId!: number;

  @IsEnum(Area)
  area!: Area;

  @Type(() => Number)
  @IsInt()
  userId!: number;
}

export class VacatePengurusDto {
  @Type(() => Number)
  @IsInt()
  roleId!: number;

  @IsEnum(Area)
  area!: Area;
}

/** Nomor WhatsApp khusus pengurus untuk landing page. Kosong/null = hapus (tidak ditampilkan). */
export class SetKontakPengurusDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const bersih = value.replace(/[\s.\-()]/g, '');
    return bersih === '' ? null : bersih;
  })
  @Matches(/^(\+62|62|0)8\d{8,12}$/, {
    message:
      'Nomor kontak harus nomor HP Indonesia, contoh 0812 3456 7890 atau +62 812 3456 7890.',
  })
  kontak?: string | null;
}
