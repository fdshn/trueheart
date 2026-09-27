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
exports.StorageService = exports.MediaSizeLimits = exports.AllowedVideoContentTypes = exports.AllowedImageContentTypes = void 0;
exports.getMediaExtension = getMediaExtension;
exports.assertAvatarUploadPolicy = assertAvatarUploadPolicy;
exports.assertPostMediaUploadPolicy = assertPostMediaUploadPolicy;
exports.assertTransactionEvidenceUploadPolicy = assertTransactionEvidenceUploadPolicy;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("../contracts");
const storage_options_1 = require("./storage-options");
exports.AllowedImageContentTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);
exports.AllowedVideoContentTypes = new Set([
    'video/mp4',
    'video/quicktime',
    'video/webm',
]);
const Megabyte = 1024 * 1024;
exports.MediaSizeLimits = {
    avatar: 5 * Megabyte,
    postMediaImage: 5 * Megabyte,
    postMediaVideo: 25 * Megabyte,
    postMedia: 25 * Megabyte,
    transactionEvidence: 5 * Megabyte,
    chatMedia: 5 * Megabyte,
    commentMedia: 5 * Megabyte,
};
const MediaLabels = {
    avatar: 'Avatar',
    postMedia: 'Phương tiện bài đăng',
    transactionEvidence: 'Ảnh bằng chứng',
    chatMedia: 'Ảnh trong chat',
    commentMedia: 'Ảnh bình luận',
};
function getMediaExtension(contentType) {
    switch (contentType) {
        case 'image/jpeg':
            return 'jpeg';
        case 'image/png':
            return 'png';
        case 'image/webp':
            return 'webp';
        case 'video/mp4':
            return 'mp4';
        case 'video/quicktime':
            return 'mov';
        case 'video/webm':
            return 'webm';
        default:
            return contentType.split('/')[1] || 'bin';
    }
}
function assertUploadPolicy(kind, request) {
    const label = MediaLabels[kind];
    const limit = exports.MediaSizeLimits[kind];
    if (!exports.AllowedImageContentTypes.has(request.contentType))
        throw new contracts_1.StorageValidationError(`${label} chỉ nhận image/jpeg, image/png hoặc image/webp.`);
    if (!Number.isInteger(request.contentLength))
        throw new contracts_1.StorageValidationError(`${label} phải khai kích thước thật.`);
    if (request.contentLength < 1 || request.contentLength > limit)
        throw new contracts_1.StorageValidationError(`${label} phải lớn hơn 0 và không quá ${Math.round(limit / Megabyte)} MB.`);
}
function assertAvatarUploadPolicy(request) {
    assertUploadPolicy('avatar', request);
}
function assertPostMediaUploadPolicy(request) {
    const isImage = exports.AllowedImageContentTypes.has(request.contentType);
    const isVideo = exports.AllowedVideoContentTypes.has(request.contentType);
    if (!isImage && !isVideo)
        throw new contracts_1.StorageValidationError('Phương tiện bài đăng chỉ nhận ảnh (image/jpeg, image/png, image/webp) hoặc video (video/mp4, video/quicktime, video/webm).');
    if (!Number.isInteger(request.contentLength))
        throw new contracts_1.StorageValidationError('Phương tiện bài đăng phải khai kích thước thật.');
    const limit = isImage
        ? exports.MediaSizeLimits.postMediaImage
        : exports.MediaSizeLimits.postMediaVideo;
    const label = isImage ? 'Ảnh bài đăng' : 'Video bài đăng';
    if (request.contentLength < 1 || request.contentLength > limit)
        throw new contracts_1.StorageValidationError(`${label} phải lớn hơn 0 và không quá ${Math.round(limit / Megabyte)} MB.`);
}
function assertTransactionEvidenceUploadPolicy(request) {
    assertUploadPolicy('transactionEvidence', request);
}
let StorageService = class StorageService {
    client;
    options;
    constructor(client, options) {
        this.client = client;
        this.options = options;
    }
    async verifyObject(kind, expectedPrefix, key) {
        const label = MediaLabels[kind];
        if (!key.startsWith(expectedPrefix))
            throw new contracts_1.StorageValidationError(`Key ${label.toLowerCase()} không thuộc chủ thể hiện tại.`);
        const object = await this.client.send(new client_s3_1.HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
        let badType = false;
        let badSize = false;
        if (kind === 'postMedia') {
            const isImage = object.ContentType
                ? exports.AllowedImageContentTypes.has(object.ContentType)
                : false;
            const isVideo = object.ContentType
                ? exports.AllowedVideoContentTypes.has(object.ContentType)
                : false;
            if (!isImage && !isVideo) {
                badType = true;
            }
            else {
                const limit = isImage
                    ? exports.MediaSizeLimits.postMediaImage
                    : exports.MediaSizeLimits.postMediaVideo;
                badSize = !object.ContentLength || object.ContentLength > limit;
            }
        }
        else {
            badType =
                !object.ContentType ||
                    !exports.AllowedImageContentTypes.has(object.ContentType);
            badSize =
                !object.ContentLength || object.ContentLength > exports.MediaSizeLimits[kind];
        }
        if (!badType && !badSize)
            return;
        await this.deleteObjects([key]);
        throw new contracts_1.StorageValidationError(badType
            ? `Object ${label.toLowerCase()} không có content type hợp lệ.`
            : `Object ${label.toLowerCase()} vượt quá kích thước cho phép.`);
    }
    async confirmAvatarUpload(userId, key) {
        await this.verifyObject('avatar', `users/${userId}/avatars/`, key);
        return `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    }
    async confirmPostMediaUpload(userId, postId, key) {
        await this.verifyObject('postMedia', `users/${userId}/posts/${postId}/media/`, key);
    }
    async confirmTransactionEvidenceUpload(userId, transactionId, key) {
        await this.verifyObject('transactionEvidence', `users/${userId}/transactions/${transactionId}/evidence/`, key);
    }
    async confirmCommentMediaUpload(userId, subjectType, subjectId, key) {
        await this.verifyObject('commentMedia', `users/${userId}/comment-media/${subjectType}/${subjectId}/`, key);
    }
    async confirmChatMediaUpload(userId, roomId, key) {
        await this.verifyObject('chatMedia', `users/${userId}/chat/${roomId}/`, key);
    }
    async createCommentMediaUpload(request) {
        assertUploadPolicy('commentMedia', request);
        const extension = request.contentType.split('/')[1];
        const key = `users/${request.userId}/comment-media/${request.subjectType}/${request.subjectId}/${(0, node_crypto_1.randomUUID)()}.${extension}`;
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
    async createTransactionEvidenceUpload(request) {
        assertTransactionEvidenceUploadPolicy(request);
        const extension = request.contentType.split('/')[1];
        const key = `users/${request.userId}/transactions/${request.transactionId}/evidence/${(0, node_crypto_1.randomUUID)()}.${extension}`;
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
    async createPostMediaUpload(request) {
        assertPostMediaUploadPolicy(request);
        const extension = getMediaExtension(request.contentType);
        const key = `users/${request.userId}/posts/${request.postId}/media/${(0, node_crypto_1.randomUUID)()}.${extension}`;
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
    async createChatMediaUpload(request) {
        assertUploadPolicy('chatMedia', request);
        const extension = request.contentType.split('/')[1];
        const key = `users/${request.userId}/chat/${request.roomId}/${(0, node_crypto_1.randomUUID)()}.${extension}`;
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
    async deleteObjects(keys) {
        if (keys.length === 0)
            return 0;
        let deleted = 0;
        for (let index = 0; index < keys.length; index += 1000) {
            const batch = keys.slice(index, index + 1000);
            try {
                const result = await this.client.send(new client_s3_1.DeleteObjectsCommand({
                    Bucket: this.options.bucket,
                    Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
                }));
                deleted += batch.length - (result.Errors?.length ?? 0);
            }
            catch {
            }
        }
        return deleted;
    }
    async listObjects(params) {
        const result = await this.client.send(new client_s3_1.ListObjectsV2Command({
            Bucket: this.options.bucket,
            Prefix: params.prefix,
            ContinuationToken: params.cursor,
            MaxKeys: params.limit ?? 1000,
        }));
        return {
            objects: (result.Contents ?? [])
                .filter((item) => Boolean(item.Key))
                .map((item) => ({
                key: item.Key,
                lastModified: item.LastModified ?? null,
                size: Number(item.Size ?? 0),
            })),
            nextCursor: result.IsTruncated
                ? (result.NextContinuationToken ?? null)
                : null,
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