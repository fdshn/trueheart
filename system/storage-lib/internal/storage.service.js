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
exports.assertPostMediaUploadPolicy = assertPostMediaUploadPolicy;
exports.assertTransactionEvidenceUploadPolicy = assertTransactionEvidenceUploadPolicy;
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
function assertPostMediaUploadPolicy(request) {
    if (!AllowedContentTypes.has(request.contentType))
        throw new Error('Media bài đăng chỉ nhận image/jpeg, image/png hoặc image/webp.');
    if (request.contentLength < 1 || request.contentLength > MaxAvatarBytes)
        throw new Error('Media bài đăng phải lớn hơn 0 và không quá 5 MB.');
}
function assertTransactionEvidenceUploadPolicy(request) {
    if (!AllowedContentTypes.has(request.contentType))
        throw new Error('Ảnh bằng chứng chỉ nhận image/jpeg, image/png hoặc image/webp.');
    if (request.contentLength < 1 || request.contentLength > MaxAvatarBytes)
        throw new Error('Ảnh bằng chứng phải lớn hơn 0 và không quá 5 MB.');
}
let StorageService = class StorageService {
    client;
    options;
    constructor(client, options) {
        this.client = client;
        this.options = options;
    }
    async confirmAvatarUpload(userId, key) {
        if (!key.startsWith(`users/${userId}/avatars/`))
            throw new Error('Avatar key không thuộc tài khoản hiện tại.');
        const object = await this.client.send(new client_s3_1.HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
        if (!object.ContentType || !AllowedContentTypes.has(object.ContentType))
            throw new Error('Object avatar không có content type ảnh hợp lệ.');
        if (!object.ContentLength || object.ContentLength > MaxAvatarBytes)
            throw new Error('Object avatar không có kích thước hợp lệ.');
        return `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    }
    async confirmPostMediaUpload(userId, postId, key) {
        if (!key.startsWith(`users/${userId}/posts/${postId}/media/`))
            throw new Error('Media key không thuộc bài đăng hiện tại.');
        const object = await this.client.send(new client_s3_1.HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
        if (!object.ContentType || !AllowedContentTypes.has(object.ContentType))
            throw new Error('Object media không có content type ảnh hợp lệ.');
        if (!object.ContentLength || object.ContentLength > MaxAvatarBytes)
            throw new Error('Object media không có kích thước hợp lệ.');
    }
    async confirmTransactionEvidenceUpload(userId, transactionId, key) {
        if (!key.startsWith(`users/${userId}/transactions/${transactionId}/evidence/`))
            throw new Error('Key ảnh bằng chứng không thuộc lượt trao hiện tại.');
        const object = await this.client.send(new client_s3_1.HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
        if (!object.ContentType || !AllowedContentTypes.has(object.ContentType))
            throw new Error('Object bằng chứng không có content type ảnh hợp lệ.');
        if (!object.ContentLength || object.ContentLength > MaxAvatarBytes)
            throw new Error('Object bằng chứng không có kích thước hợp lệ.');
    }
    async confirmCommentMediaUpload(userId, subjectType, subjectId, key) {
        const prefix = `users/${userId}/comment-media/${subjectType}/${subjectId}/`;
        if (!key.startsWith(prefix))
            throw new Error('Key ảnh bình luận không thuộc chủ thể hiện tại.');
        const object = await this.client.send(new client_s3_1.HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
        if (!object.ContentType || !AllowedContentTypes.has(object.ContentType))
            throw new Error('Object ảnh bình luận không có content type hợp lệ.');
        if (!object.ContentLength || object.ContentLength > MaxAvatarBytes)
            throw new Error('Object ảnh bình luận không có kích thước hợp lệ.');
    }
    async createCommentMediaUpload(request) {
        assertTransactionEvidenceUploadPolicy({
            userId: request.userId,
            transactionId: request.subjectId,
            contentType: request.contentType,
            contentLength: request.contentLength,
        });
        const extension = request.contentType.split('/')[1];
        const key = `users/${request.userId}/comment-media/${request.subjectType}/${request.subjectId}/${(0, node_crypto_1.randomUUID)()}.${extension}`;
        const expiresInSeconds = this.options.uploadExpiresInSeconds ?? 300;
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.client, new client_s3_1.PutObjectCommand({
            Bucket: this.options.bucket,
            Key: key,
            ContentType: request.contentType,
        }), { expiresIn: expiresInSeconds });
        return {
            key,
            uploadUrl,
            expiresInSeconds,
            publicUrl: `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`,
        };
    }
    async createTransactionEvidenceUpload(request) {
        assertTransactionEvidenceUploadPolicy(request);
        const extension = request.contentType.split('/')[1];
        const key = `users/${request.userId}/transactions/${request.transactionId}/evidence/${(0, node_crypto_1.randomUUID)()}.${extension}`;
        const expiresInSeconds = this.options.uploadExpiresInSeconds ?? 300;
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.client, new client_s3_1.PutObjectCommand({
            Bucket: this.options.bucket,
            Key: key,
            ContentType: request.contentType,
        }), { expiresIn: expiresInSeconds });
        return {
            key,
            uploadUrl,
            expiresInSeconds,
            publicUrl: `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`,
        };
    }
    async createPostMediaUpload(request) {
        assertPostMediaUploadPolicy(request);
        const extension = request.contentType.split('/')[1];
        const key = `users/${request.userId}/posts/${request.postId}/media/${(0, node_crypto_1.randomUUID)()}.${extension}`;
        const expiresInSeconds = this.options.uploadExpiresInSeconds ?? 300;
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.client, new client_s3_1.PutObjectCommand({
            Bucket: this.options.bucket,
            Key: key,
            ContentType: request.contentType,
        }), { expiresIn: expiresInSeconds });
        return {
            key,
            uploadUrl,
            expiresInSeconds,
            publicUrl: `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`,
        };
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