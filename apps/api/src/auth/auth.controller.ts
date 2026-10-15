import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AllowRestricted, AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { PrismaService } from '../common/prisma.service';
import { Meta, RequestMeta } from '../common/request-meta';
import { publicUser, AuthService } from './auth.service';
import { AdminTwoFactorDto, LanguageDto, LoginDto, PhoneCodeDto, PhoneDto, RegisterDto, ResendDto, ResetPasswordDto } from './dto';
import { REFRESH_COOKIE, TokensService } from './tokens.service';

// REQ-SEC-04: rate limits on login and OTP endpoints (per IP), on top of per-phone OTP limits.
const STRICT = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private tokens: TokensService, private prisma: PrismaService) {}

  @Public() @Post('register') @Throttle(STRICT)
  register(@Body() dto: RegisterDto, @Meta() meta: RequestMeta) {
    return this.auth.register(dto, meta);
  }

  @Public() @Post('register/verify') @HttpCode(200) @Throttle(STRICT)
  verify(@Body() dto: PhoneCodeDto, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    return this.auth.verifyRegistration(dto.phone, dto.code, meta, res);
  }

  @Public() @Post('otp/resend') @HttpCode(200) @Throttle(STRICT)
  resend(@Body() dto: ResendDto, @Meta() meta: RequestMeta) {
    return this.auth.resendOtp(dto.phone, dto.purpose, meta);
  }

  @Public() @Post('login') @HttpCode(200) @Throttle(STRICT)
  login(@Body() dto: LoginDto, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto, meta, res, false);
  }

  @Public() @Post('admin/login') @HttpCode(200) @Throttle(STRICT)
  adminLogin(@Body() dto: LoginDto, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto, meta, res, true);
  }

  @Public() @Post('admin/2fa') @HttpCode(200) @Throttle(STRICT)
  adminTwoFactor(@Body() dto: AdminTwoFactorDto, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    return this.auth.adminTwoFactor(dto.challenge, dto.code, meta, res);
  }

  @Public() @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.tokens.rotate(res, req.cookies?.[REFRESH_COOKIE]);
    return { ok: true };
  }

  @Public() @Post('forgot') @HttpCode(200) @Throttle(STRICT)
  forgot(@Body() dto: PhoneDto, @Meta() meta: RequestMeta) {
    return this.auth.forgot(dto.phone, meta);
  }

  @Public() @Post('reset') @HttpCode(200) @Throttle(STRICT)
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.reset(dto);
  }

  @Public() @Post('logout') @HttpCode(200)
  async logout(@Req() req: Request & { user?: AuthUser }, @Res({ passthrough: true }) res: Response) {
    if (req.user) await this.tokens.revoke(req.user.sessionId);
    this.tokens.clear(res);
    return { ok: true };
  }

  @Post('logout-all') @HttpCode(200) @AllowRestricted()
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.tokens.revokeAll(user.id);
    this.tokens.clear(res);
    return { ok: true };
  }

  @Public() @Get('me')
  async me(@Req() req: Request & { user?: AuthUser }) {
    if (!req.user) return { user: null };
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    return { user: { ...publicUser(user), twoFactor: req.user.twoFactor } };
  }

  @Patch('me/language') @AllowRestricted()
  async language(@CurrentUser() user: AuthUser, @Body() dto: LanguageDto) {
    await this.prisma.user.update({ where: { id: user.id }, data: { language: dto.language } });
    return { ok: true };
  }
}
