"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
exports.assertAvatarUploadPolicy = assertAvatarUploadPolicy;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const storage_options_1 = require("./storage-options");
const AllowedContentTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MaxAvatarBytes = 5 * 1024 * 1024;
function assertAvatarUploadPolicy(request) {
    if (!AllowedContentTypes.has(request.contentType))
        throw new Error('Avatar chỉ nhận image/jpeg, image/png hoặc image/webp.');
    if (request.contentLength < 1 || request.contentLength > MaxAvatarBytes)
        throw new Error('Avatar phải lớn hơn 0 và không quá 5 MB.');
}
let StorageService = class StorageService {
    client;
    options;
    constructor(client, options) {
        this.client = client;
        this.options = options;
    }
    async createAvatarUpload(request) {
        assertAvatarUploadPolicy(request);
        const extension = request.contentType.split('/')[1];
        const key = `users/${request.userId}/avatars/${(0, node_crypto_1.randomUUID)()}.${extension}`;
        const expiresInSeconds = this.options.uploadExpiresInSeconds ?? 300;
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.client, new client_s3_1.PutObjectCommand({
            Bucket: this.options.bucket,
            Key: key,
            ContentType: request.contentType,
            ContentLength: request.contentLength,
        }), { expiresIn: expiresInSeconds });
        return {
            key,
            uploadUrl,
            expiresInSeconds,
            publicUrl: `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`,
        };
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(storage_options_1.IS3Client)),
    __param(1, (0, common_1.Inject)(storage_options_1.IStorageOptions)),
    __metadata("design:paramtypes", [client_s3_1.S3Client, Object])
], StorageService);
//# sourceMappingURL=storage.service.js.map