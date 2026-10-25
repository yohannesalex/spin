import { Equals, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// REQ-AUTH-02: min 8 characters, at least one letter and one digit.
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
const PASSWORD_MSG = 'Password needs at least 8 characters, including a letter and a digit';

export class RegisterDto {
  @IsString() @MinLength(3) @MaxLength(100) fullName: string;
  @IsString() @MaxLength(20) phone: string;
  @Matches(PASSWORD_RE, { message: PASSWORD_MSG }) password: string;
  @Equals(true, { message: 'You must be 18 or older' }) ageConfirmed: boolean;
  @Equals(true, { message: 'You must accept the terms' }) termsAccepted: boolean;
  @IsOptional() @IsIn(['en', 'am']) language?: 'en' | 'am';
  @IsOptional() @IsString() turnstileToken?: string;
}

export class PhoneCodeDto {
  @IsString() @MaxLength(20) phone: string;
  @IsString() @Matches(/^\d{4,6}$/, { message: 'Enter the code' }) code: string;
}

export class PhoneDto {
  @IsString() @MaxLength(20) phone: string;
}

export class ResendDto {
  @IsString() @MaxLength(20) phone: string;
  @IsIn(['REGISTER', 'RESET']) purpose: 'REGISTER' | 'RESET';
}

export class LoginDto {
  @IsString() @MaxLength(20) phone: string;
  @IsString() @MaxLength(128) password: string;
}

export class AdminTwoFactorDto {
  @IsString() challenge: string;
  @IsString() @Matches(/^\d{4,6}$/, { message: 'Enter the code' }) code: string;
}

export class ResetPasswordDto {
  @IsString() @MaxLength(20) phone: string;
  @IsString() @Matches(/^\d{4,6}$/, { message: 'Enter the code' }) code: string;
  @Matches(PASSWORD_RE, { message: PASSWORD_MSG }) password: string;
}

export class LanguageDto {
  @IsIn(['en', 'am']) language: 'en' | 'am';
}
