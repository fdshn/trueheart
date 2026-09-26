"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageValidationError = void 0;
exports.isStorageValidationError = isStorageValidationError;
class StorageValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'StorageValidationError';
    }
}
exports.StorageValidationError = StorageValidationError;
function isStorageValidationError(error) {
    return error instanceof StorageValidationError;
}
//# sourceMappingURL=storage-error.js.map