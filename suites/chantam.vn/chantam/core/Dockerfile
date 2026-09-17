# Sinh tự động bởi bin/make-dockerfile.mjs cho package: @chantam.vn/chantam.core
# Không sửa tay — chạy lại `npm run docker:generate` sau khi đổi dependency.

FROM node:22 AS builder

WORKDIR /app

# Copy manifest trước để layer cài đặt được cache lại khi source thay đổi
COPY ./kernel/common-lib/package.json ./kernel/common-lib/package.json
COPY ./kernel/persistency-lib/package.json ./kernel/persistency-lib/package.json
COPY ./suites/chantam.vn/chantam/core-lib/package.json ./suites/chantam.vn/chantam/core-lib/package.json
COPY ./system/auth-lib/package.json ./system/auth-lib/package.json
COPY ./kernel/health-lib/package.json ./kernel/health-lib/package.json
COPY ./kernel/logger-lib/package.json ./kernel/logger-lib/package.json
COPY ./system/storage-lib/package.json ./system/storage-lib/package.json
COPY ./suites/chantam.vn/chantam/core/package.json ./suites/chantam.vn/chantam/core/package.json
COPY ./package.json ./package-lock.json ./lerna.json ./

RUN npm ci

# Copy source
COPY ./kernel/common-lib/ ./kernel/common-lib/
COPY ./kernel/persistency-lib/ ./kernel/persistency-lib/
COPY ./suites/chantam.vn/chantam/core-lib/ ./suites/chantam.vn/chantam/core-lib/
COPY ./system/auth-lib/ ./system/auth-lib/
COPY ./kernel/health-lib/ ./kernel/health-lib/
COPY ./kernel/logger-lib/ ./kernel/logger-lib/
COPY ./system/storage-lib/ ./system/storage-lib/
COPY ./suites/chantam.vn/chantam/core/ ./suites/chantam.vn/chantam/core/

# Build thư viện phụ thuộc trước, rồi tới package đích
RUN npm run build --workspace ./kernel/common-lib
RUN npm run build --workspace ./kernel/persistency-lib
RUN npm run build --workspace ./suites/chantam.vn/chantam/core-lib
RUN npm run build --workspace ./system/auth-lib
RUN npm run build --workspace ./kernel/health-lib
RUN npm run build --workspace ./kernel/logger-lib
RUN npm run build --workspace ./system/storage-lib
RUN npm run build --workspace ./suites/chantam.vn/chantam/core

RUN npm prune --omit=dev

# Bỏ source và test khỏi image cuối
RUN find . -name node_modules -prune -o -type d \( -name src -o -name test \) -print0 \
  | xargs -0 rm -rf

FROM node:22-slim AS runner

COPY --from=builder /app /app

WORKDIR /app/suites/chantam.vn/chantam/core

ENV NODE_ENV=production
USER node

CMD ["npm", "start"]
