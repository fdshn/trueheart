"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var StorageModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageModule = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const common_1 = require("@nestjs/common");
const contracts_1 = require("../contracts");
const storage_options_1 = require("./storage-options");
const storage_service_1 = require("./storage.service");
let StorageModule = StorageModule_1 = class StorageModule {
    static forRootAsync(options) {
        return {
            global: true,
            module: StorageModule_1,
            imports: options.imports ?? [],
            providers: [
                {
                    provide: storage_options_1.IStorageOptions,
                    inject: options.inject,
                    useFactory: options.useFactory,
                },
                {
                    provide: storage_options_1.IS3Client,
                    inject: [storage_options_1.IStorageOptions],
                    useFactory: (config) => new client_s3_1.S3Client({
                        endpoint: config.endpoint,
                        region: config.region,
                        credentials: {
                            accessKeyId: config.accessKeyId,
                            secretAccessKey: config.secretAccessKey,
                        },
                        forcePathStyle: true,
                    }),
                },
                { provide: contracts_1.IObjectStorage, useClass: storage_service_1.StorageService },
            ],
            exports: [contracts_1.IObjectStorage],
        };
    }
};
exports.StorageModule = StorageModule;
exports.StorageModule = StorageModule = StorageModule_1 = __decorate([
    (0, common_1.Module)({})
], StorageModule);
//# sourceMappingURL=storage.module.js.map