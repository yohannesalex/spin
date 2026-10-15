import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { Provider } from '@prisma/client';

export class RequestWithdrawalDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) amount: number;
  @IsEnum(Provider) method: Provider;
  @IsString() @Matches(/^[+\d\s-]{9,20}$/, { message: 'Enter a valid account or phone number' }) destAccount: string;
  @IsString() @MinLength(3) @MaxLength(100) destName: string;
}

export class MarkPaidDto {
  @IsString() @MinLength(4) @MaxLength(60) transferRef: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class RejectDto {
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}
