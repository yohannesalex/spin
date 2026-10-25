import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Provider } from '@prisma/client';

const NEED_LINK = 'Paste the receipt link or transaction reference';

export class SubmitDepositDto {
  @IsEnum(Provider) provider: Provider;
  /** Amount in birr the user says they sent. */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) amount: number;
  /** Receipt link (Telebirr / CBE share link) or transaction reference. */
  // Decorators run bottom-up/right-to-left: check "is it there" before length.
  @MaxLength(300, { message: 'That receipt link is too long' }) @MinLength(6, { message: NEED_LINK }) @IsString({ message: NEED_LINK }) reference: string;
}

/** TESTING ONLY (DEPOSIT_SIMULATION=true): credit a fake payment without any receipt. */
export class SimulateDepositDto {
  @IsEnum(Provider) provider: Provider;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(1_000_000) amount: number;
}
