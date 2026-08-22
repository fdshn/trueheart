# `@template-lib`

Khuôn để tạo một package library mới. **Không import package này** — copy nó.

## Cách dùng

```bash
cp -r kernel/@template-lib system/<tên>-lib
cd system/<tên>-lib
# Sửa "changeme" trong package.json, index.ts và README.md
```

Rồi khai báo dependency từ package tiêu thụ:

```bash
cd suites/chantam.vn/chantam/core
npm i -S ../../../../system/<tên>-lib
```

## Cấu trúc quy ước

```
src/
├── index.ts       # hằng số tên service
├── consts/        # enum + error-codes.ts (ErrorCodes + ErrorOrigin)
├── models/        # interface nghiệp vụ thuần
├── entities/      # interface entity + token DI (Symbol)
├── values/        # value object
└── dto/<resource>/  # interface DTO, mỗi intent một file
```

## Lưu ý build

`outDir` là chính thư mục gốc package (`.`), nên `src/consts/index.ts` biên dịch thành
`consts/index.js` — nhờ đó import subpath `@chantam/service.<tên>-lib/consts` hoạt động mà
không cần khai báo trường `exports`.

Sau khi sửa library, **phải `npm run build`** thì service phụ thuộc mới thấy thay đổi.
