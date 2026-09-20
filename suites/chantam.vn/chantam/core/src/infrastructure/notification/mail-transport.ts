/** Tham số gửi một email, đã giải mã sẵn. Không log đối tượng này. */
export interface IMailSendCommand {
  readonly host: string;
  readonly port: number;
  readonly username: string | null;
  readonly secret: string;
  readonly fromAddress: string;
  readonly fromName: string | null;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

/**
 * Tách khỏi `ConfiguredOtpSender` để nghiệp vụ gửi kiểm thử được mà không cần
 * dựng một SMTP server thật.
 */
export interface IMailTransport {
  send(command: IMailSendCommand): Promise<void>;
}

export const IMailTransport = Symbol('IMailTransport');
