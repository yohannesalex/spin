import { Logger } from '@nestjs/common';

/** REQ-AUTH-09: the SMS/OTP sender is behind an interface so the provider can be swapped. */
export interface SmsProvider {
  sendOtp(phone: string, code: string, message: string): Promise<void>;
  send(phone: string, message: string): Promise<void>;
}

/** REQ-AUTH-10: in development OTPs are logged to the console instead of sent. */
export class ConsoleSmsProvider implements SmsProvider {
  private log = new Logger('SMS');
  async sendOtp(phone: string, code: string, message: string) {
    this.log.warn(`[DEV OTP] ${phone}: ${code}  (${message})`);
  }
  async send(phone: string, message: string) {
    this.log.log(`[DEV SMS] ${phone}: ${message}`);
  }
}

/** AfroMessage (https://afromessage.com) — Ethiopian SMS gateway, recommended in spec §3.5. */
export class AfroMessageProvider implements SmsProvider {
  private log = new Logger('AfroMessage');
  constructor(private token: string, private sender?: string, private identifier?: string) {}

  async sendOtp(phone: string, _code: string, message: string) {
    await this.send(phone, message);
  }

  async send(phone: string, message: string) {
    const url = new URL('https://api.afromessage.com/api/send');
    url.searchParams.set('to', phone);
    url.searchParams.set('message', message);
    if (this.identifier) url.searchParams.set('from', this.identifier);
    if (this.sender) url.searchParams.set('sender', this.sender);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    const body = (await res.json().catch(() => ({}))) as { acknowledge?: string };
    if (!res.ok || body.acknowledge !== 'success') {
      // Never log the message itself: it may contain an OTP (REQ-SEC-06).
      this.log.error(`SMS to ${phone.slice(0, 6)}… failed: HTTP ${res.status}`);
      throw new Error('SMS delivery failed');
    }
  }
}

/**
 * SMS Gateway for Android (https://sms-gate.app): sends real SMS from an Android phone's own SIM.
 * Works with the app's Cloud Server (default URL) or Local Server (http://<phone-ip>:8080/message).
 * The gateway accepts the message and the phone sends it shortly after.
 */
export class SmsGateProvider implements SmsProvider {
  private log = new Logger('SmsGate');
  constructor(private url: string, private username: string, private password: string) {}

  async sendOtp(phone: string, _code: string, message: string) {
    await this.send(phone, message);
  }

  async send(phone: string, message: string) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ textMessage: { text: message }, phoneNumbers: [phone] }),
      signal: AbortSignal.timeout(10_000),
    }).catch((e: Error) => {
      this.log.error(`SMS to ${phone.slice(0, 6)}… failed: ${e.message}`);
      throw new Error('SMS delivery failed');
    });
    if (!res.ok) {
      // Never log the message itself: it may contain an OTP (REQ-SEC-06).
      this.log.error(`SMS to ${phone.slice(0, 6)}… failed: HTTP ${res.status}`);
      throw new Error('SMS delivery failed');
    }
  }
}

export function createSmsProvider(): SmsProvider {
  const log = new Logger('SMS');
  if (process.env.LOG_OTP === 'true') log.warn('LOG_OTP is on: OTP codes are written to the log. Turn it off before going live.');
  if (process.env.SMS_PROVIDER === 'smsgate' && process.env.SMSGATE_USERNAME && process.env.SMSGATE_PASSWORD) {
    return new SmsGateProvider(
      process.env.SMSGATE_URL || 'https://api.sms-gate.app/3rdparty/v1/messages',
      process.env.SMSGATE_USERNAME,
      process.env.SMSGATE_PASSWORD,
    );
  }
  if (process.env.SMS_PROVIDER === 'afromessage' && process.env.AFROMESSAGE_TOKEN) {
    return new AfroMessageProvider(
      process.env.AFROMESSAGE_TOKEN,
      process.env.AFROMESSAGE_SENDER_ID || undefined,
      process.env.AFROMESSAGE_IDENTIFIER_ID || undefined,
    );
  }
  if (process.env.SMS_PROVIDER && process.env.SMS_PROVIDER !== 'console') {
    log.warn(`SMS_PROVIDER=${process.env.SMS_PROVIDER} is missing its credentials; codes are only printed to the log.`);
  }
  return new ConsoleSmsProvider();
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
