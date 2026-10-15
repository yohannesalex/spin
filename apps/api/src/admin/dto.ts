import { Type } from 'class-transformer';
import { Allow, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { Provider } from '@prisma/client';

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

/** §7: every admin action needs a reason. */
export class ReasonDto {
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class ApproveDepositDto extends ReasonDto {
  /** Optional corrected amount in birr. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount?: number;
}

export class AskInfoDto extends ReasonDto {
  @IsString() @MinLength(3) @MaxLength(500) message: string;
}

export class BanDto extends ReasonDto {
  @IsOptional() @IsDateString() until?: string | null;
  @IsIn(['cancel', 'freeze']) withdrawals: 'cancel' | 'freeze';
}

export class AdjustDto extends ReasonDto {
  /** Signed amount in birr. */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) amount: number;
}

export class PayWinnerDto extends ReasonDto {
  @IsEnum(Provider) method: Provider;
  @IsString() @MaxLength(30) destAccount: string;
  @IsString() @MinLength(3) @MaxLength(100) destName: string;
  @IsString() @MinLength(4) @MaxLength(60) transferRef: string;
}

export class SettingDto extends ReasonDto {
  @Allow() value: unknown;
}

export class ReconciliationDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) telebirr: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cbe: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreateAdminDto extends ReasonDto {
  @IsString() @MinLength(3) @MaxLength(100) fullName: string;
  @IsString() @MaxLength(20) phone: string;
  @Matches(PASSWORD_RE, { message: 'Password needs at least 8 characters, including a letter and a digit' }) password: string;
}

export class ResetAdmin2faDto extends ReasonDto {
  /** New phone that receives the admin's 2FA codes. */
  @IsString() @MaxLength(20) phone: string;
}
