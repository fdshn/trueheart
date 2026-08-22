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

export interface IDocsModuleOptions {
  title: string;
  description: string;
  version: string;
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

    const config = new DocumentBuilder()
      .setTitle(this.options.title)
      .setDescription(this.options.description)
      .setVersion(this.options.version)
      .addBearerAuth()
      .build();

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
