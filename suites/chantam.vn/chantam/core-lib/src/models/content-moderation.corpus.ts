/**
 * Corpus thử cho bộ lọc từ ngữ — dùng chung giữa spec và script kiểm DB thật.
 *
 * ## Vì sao nằm trong thư viện chứ không trong thư mục test
 *
 * Hai phép kiểm cần đúng corpus này: spec của `screenText` (canh bộ SO KHỚP) và
 * `test:config-inventory` (canh danh sách ĐANG NẰM trong database). Hai bản sao
 * của một corpus 40 câu sẽ trôi khỏi nhau, và khi trôi thì cái yếu hơn thắng —
 * người ta sửa cái đang đỏ cho xanh rồi đi tiếp.
 *
 * Nó là dữ liệu kiểm, nhưng là dữ liệu mà HAI package cần, nên chỗ đúng là thư
 * viện dùng chung.
 *
 * ## Vì sao corpus là thứ quyết định danh sách từ, không phải cảm giác
 *
 * Bộ chuẩn hoá BỎ DẤU để chống lách. Cái giá là nhiều từ thô tục tiếng Việt sau
 * khi bỏ dấu trùng khít với từ thường gặp nhất:
 *
 * | Từ tục | Sau chuẩn hoá | Trùng với |
 * | --- | --- | --- |
 * | `cặc` | `cac` | **các** |
 * | `lồn` | `lon` | **lon** (lon sữa) |
 * | `buồi` | `buoi` | **buổi** (buổi sáng) |
 * | `đĩ` | `di` | **đi** |
 * | `địt` | `dit` | **đít** |
 *
 * Nên **bốn từ thô tục nặng nhất tiếng Việt không biểu đạt được** trong bộ lọc
 * này. Thêm chúng vào là chặn "các bạn ơi", "còn hai lon sữa", "buổi sáng mình
 * có nhà". Đó là giới hạn của cách so khớp, không phải chỗ bỏ sót của danh sách —
 * và ai định "bổ sung cho đủ" cần biết trước, không thì họ sẽ thêm và đẩy một
 * lỗi rất khó truy ra lên production.
 *
 * Cách đi quanh: dùng dạng NHIỀU TỪ (`địt mẹ`, `đĩ thoã`) — chúng không trùng gì.
 * Muốn bắt từ đơn thì phải đổi bộ so khớp, không phải đổi danh sách.
 */

/**
 * Câu VÔ HẠI, hợp lý trên một nền tảng cho tặng đồ ở Việt Nam.
 *
 * Cố ý nhồi đúng những chỗ dễ bắt nhầm: "các", "lon", "buổi", "đi", "đít",
 * "sung túc", "con chó", "súc vật", "giá rẻ". Mỗi câu ở đây từng là một dương
 * tính giả thật của danh sách seed đầu tiên, hoặc của một ứng viên tôi đã loại.
 */
export const InnocentModerationCorpus: readonly string[] = [
  'các bạn ơi mình còn bộ sách này',
  'mình tặng các cháu nhỏ trong xóm',
  'buổi sáng mình có nhà, buổi chiều đi làm',
  'cho mình xin một buổi hẹn nhé',
  'nhà mình sung túc hơn trước nên muốn cho lại',
  'chúc gia đình bạn sung túc',
  'còn hai lon sữa bột cho bé',
  'mình có thùng lon nước ngọt chưa mở',
  'con chó nhà mình vừa sinh, ai cần chuồng không',
  'chuồng chó cũ còn tốt, ai nuôi thì lấy',
  'còn ít thức ăn cho súc vật, ai nuôi mèo thì lấy',
  'thuốc thú y cho súc vật còn hạn',
  'con đi học xa nên để lại cái bàn',
  'cái đít nồi hơi móp nhưng vẫn dùng được',
  'mình mua hồi đó giá rẻ nên tặng lại thôi',
  'bạn đi đường nào tới cho tiện',
  'đồ này của dì mình để lại',
  'mình ở gần chợ, ai đi ngang thì ghé',
  'xin phép nhắn tin sau nhé mình đang bận',
  'nồi cơm điện còn bảo hành',
  'bộ ấm chén sứ còn nguyên, chưa dùng lần nào',
  'mình dọn nhà nên muốn cho bớt đồ',
  'áo khoác mùa đông size M còn mới',
  'xe đạp cũ phanh còn tốt, tặng bạn nào cần đi học',
  'mình có ít gạo và mì, ai khó khăn thì nhắn',
  'sách giáo khoa lớp 5 còn đủ bộ',
  'cái tủ lạnh mini chạy êm, cho không',
  'bình nước nóng dùng hai năm vẫn tốt',
  'mình để ở cổng, bạn qua lấy giúp nhé',
  'cảm ơn bạn đã nhận, chúc bạn nhiều sức khoẻ',
  'đồ chơi của con mình lớn rồi không dùng nữa',
  'nếu bạn cần thêm thì cứ nói',
  'mình gửi kèm dây sạc luôn cho tiện',
  'chậu cây này dễ sống, tưới ít nước',
  'hàng này mình dùng rồi nên có vết xước nhỏ',
  'bạn ở phường nào để mình tính đường',
];

/**
 * Câu XẤU, mỗi câu nhằm đúng một mục trong danh sách.
 *
 * Dùng để phát hiện **từ chết**: một mục không bắt được câu nào là một mục không
 * làm gì, và nó trông y như một mục đang bảo vệ điều gì đó. Đúng họ lỗi với khoá
 * cấu hình không ai đọc và quyền không ai kiểm.
 */
export const AbusiveModerationCorpus: readonly string[] = [
  'đm cái thằng này',
  'đ.m mày',
  'đcm cái gì thế',
  'vcl sao lâu thế',
  'vkl thật à',
  'clm nói nhiều',
  'cmn rồi còn gì',
  'thằng chó này lừa người',
  'chó chết thật',
  'mày mất dạy quá',
  'đồ vô học',
  'khốn nạn thật sự',
  'đồ rác rưởi',
  'óc lợn à',
  'thằng điên kia',
  'đồ súc vật',
  'thằng súc vật',
  'địt mẹ mày',
  'đĩ thoã',
  'mẹ mày',
  'bố mày',
  'cút đi cho tao yên',
  'im đi đừng nói nữa',
  'đồ khốn',
  'chuyển khoản trước rồi tôi gửi',
  'đặt cọc 200k nhé',
  'cọc trước đi',
  'gửi phí vận chuyển qua momo',
  'phí giữ hàng 50k nhé',
  'chuyển tiền qua đây trước',
  'cho mình số tài khoản',
  'mua thẻ cào nạp giúp',
  'nạp thẻ giúp mình 500k',
  'đọc mã otp cho mình',
  'mã otp vừa gửi là gì',
  'cho vay tiền gấp',
  'lãi suất thấp thôi',
  'ship cod trả tiền khi nhận',
  'nhắn zalo riêng cho tiện',
  'kết bạn zalo nha',
  'inbox riêng mình nói',
  'liên hệ ngoài đi đừng trên đây',
  'nhắn telegram cho nhanh',
  'kết bạn facebook rồi nói tiếp',
  'cho số điện thoại riêng đi',
  'có thuốc lá không',
  'còn rượu mạnh không',
  'bán vũ khí tự chế',
  'dao găm sắc lắm',
  'khẩu súng này còn tốt',
  'súng ngắn mô hình',
  'súng hơi bắn chim',
  'súng săn cũ còn dùng được',
  'có ma túy không',
  'cần sa loại tốt',
  'pháo nổ tết',
  'động vật hoang dã quý',
  'thuốc kê đơn không cần toa',
  'nội tạng tươi',
  'chất kích thích mạnh',
  'thực phẩm hết hạn vẫn dùng được',
  'cần bán gấp cái này',
  'bán gấp trong hôm nay',
  'bán lại cho ai cần',
  'thanh lý toàn bộ kho',
];
