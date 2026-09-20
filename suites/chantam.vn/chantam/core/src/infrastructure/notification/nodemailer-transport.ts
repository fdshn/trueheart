import { Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { IMailSendCommand, IMailTransport } from './mail-transport';

@Injectable()
export class NodemailerTransport implements IMailTransport {
  public async send(command: IMailSendCommand): Promise<void> {
    const transport = createTransport({
      host: command.host,
      port: command.port,
      // 465 là SMTPS (TLS ngay từ đầu); các cổng khác dùng STARTTLS.
      secure: command.port === 465,
      auth: command.username
        ? { user: command.username, pass: command.secret }
        : undefined,
    });

    try {
      await transport.sendMail({
        from: command.fromName
          ? { name: command.fromName, address: command.fromAddress }
          : command.fromAddress,
        to: command.to,
        subject: command.subject,
        text: command.body,
      });
    } finally {
      // Giữ kết nối mở sau khi gửi thì tiến trình không thoát được, và cấu hình
      // đổi từ CMS cũng không có hiệu lực cho tới lần khởi động sau.
      transport.close();
    }
  }
}
