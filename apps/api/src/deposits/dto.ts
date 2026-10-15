import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Provider } from '@prisma/client';

export class SubmitDepositDto {
  @IsEnum(Provider) provider: Provider;
  /** Amount in birr the user says they sent. */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) amount: number;
  /** Receipt link or transaction reference, as an alternative to the image. */
  @IsOptional() @IsString() @MaxLength(300) reference?: string;
}
