import {
  DynamicModule,
  INestApplication,
  Inject,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IModuleAsyncOptions } from '../module-async-options';

type AppProvider =
  | INestApplication
  | (() => INestApplication)
  | (() => Promise<INestApplication>);

/** Một môi trường chọn được trong ô "Servers" của Swagger UI. */
export interface IDocsServer {
  url: string;
  description: string;
}

export interface IDocsModuleOptions {
  title: string;
  description: string;
  version: string;

  /**
   * Danh sách môi trường hiện trong ô chọn của Swagger UI.
   *
   * Không khai thì Swagger lấy chính host đang mở trang, nên người đọc tài liệu
   * trên server staging không gọi thử sang máy mình được và ngược lại. Thứ tự
   * trong mảng là thứ tự hiện ra; đặt môi trường an toàn nhất lên đầu để không
   * ai lỡ bấm "Try it out" thẳng vào production.
   */
  servers?: readonly IDocsServer[];

  /** Thường là `() => appContext.waitForApp()`. */
  app: AppProvider;
}

const IDocsModuleOptions = Symbol('IDocsModuleOptions');

/** Đăng ký Swagger tại `/docs` (UI) và `/docs/json` (đặc tả OpenAPI). */
@Module({})
export class DocsModule implements OnModuleInit {
  public static forRootAsync(
    options: IModuleAsyncOptions<IDocsModuleOptions>,
  ): DynamicModule {
    return {
      global: options.global,
      module: DocsModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: IDocsModuleOptions,
          useFactory: options.useFactory,
          inject: options.inject,
        },
      ],
    };
  }

  public constructor(
    @Inject(IDocsModuleOptions)
    private readonly options: IDocsModuleOptions,
  ) {}

  public async onModuleInit(): Promise<void> {
    const app =
      typeof this.options.app === 'function'
        ? await this.options.app()
        : this.options.app;

    const builder = new DocumentBuilder()
      .setTitle(this.options.title)
      .setDescription(this.options.description)
      .setVersion(this.options.version)
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Dán access token lấy từ POST /api/v1/auth/login hoặc /api/v1/auth/register. ' +
          'Chỉ dán phần token, KHÔNG kèm chữ "Bearer".',
      });

    for (const server of this.options.servers ?? [])
      builder.addServer(server.url, server.description);

    const config = builder.build();

    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, config),
      {
        jsonDocumentUrl: 'docs/json',
        customSiteTitle: `${this.options.title} | Tài liệu API`,
      },
    );
  }
}
