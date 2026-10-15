import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class JoinDto {
  @IsInt() @Min(1) @Max(100) number: number;
}

export class TemplateDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) stake: number; // birr
  @IsInt() @Min(2) @Max(100) capacity: number;
  @IsOptional() @IsInt() @Min(2) @Max(100) minPlayers?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(50) commissionPct?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10080) deadlineMinutes?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class CancelDto {
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}
