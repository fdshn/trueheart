import { Global, Injectable, Module } from '@nestjs/common';

export type AppReadyListener<Application extends object = any> = (
  app: Application,
) => void;

/**
 * Cầu nối để provider bên trong DI container chạm tới instance ứng dụng.
 *
 * Cần thiết vì một số thao tác (SwaggerModule.setup, useWebSocketAdapter) chỉ
 * có tác dụng trong khoảng giữa `NestFactory.create()` và `app.listen()`.
 */
export interface IAppContext<Application extends object = any> {
  readonly app: Application;
  setApp(app: Application): void;
  waitForApp(): Promise<Application>;
  onAppReady(listener: AppReadyListener<Application>): void;
}

export const IAppContext = Symbol('IAppContext');

@Injectable()
class AppContext implements IAppContext {
  private instance?: object;
  private resolveWaiter!: () => void;
  private readonly waiter = new Promise<void>((resolve) => {
    this.resolveWaiter = resolve;
  });
  private readonly listeners: AppReadyListener[] = [];

  public get app(): any {
    if (!this.instance) throw new Error('AppContext: app chưa được gán');

    return this.instance;
  }

  public setApp(app: object): void {
    if (this.instance) throw new Error('AppContext: app đã được gán trước đó');

    this.instance = app;
    this.resolveWaiter();

    // Gọi đồng bộ ngay trong `setApp` ở main.ts, trước khi `app.listen()` chạy
    // `app.init()` — đây là cửa sổ duy nhất mà cấu hình cấp ứng dụng còn hiệu lực.
    while (this.listeners.length > 0) this.listeners.shift()!(app);
  }

  public async waitForApp(): Promise<any> {
    if (this.instance) return this.instance;

    await this.waiter;

    return this.app;
  }

  public onAppReady(listener: AppReadyListener): void {
    if (this.instance) {
      listener(this.instance);

      return;
    }

    this.listeners.push(listener);
  }
}

@Global()
@Module({
  providers: [{ provide: IAppContext, useClass: AppContext }],
  exports: [IAppContext],
})
export class AppContextModule {}
