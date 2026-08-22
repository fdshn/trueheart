import { Inject, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ApplicationModule } from './application/application.module';
import { IConfig } from './domain/ports/config';
import { InfrastructureModule } from './infrastructure/infrastructure.module';

@Module({
  imports: [ApplicationModule, InfrastructureModule],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger('AppModule');

  public constructor(
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public onModuleInit(): void {
    this.logger.log(
      `Chân Tâm Core khởi động ở cổng ${this.config.port} (${this.config.env})`,
    );
  }
}
