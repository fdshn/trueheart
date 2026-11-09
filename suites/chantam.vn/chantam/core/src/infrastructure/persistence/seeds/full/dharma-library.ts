import { SeedDomains, seedId } from './seed-context';

/**
 * Thư viện Phật pháp: chùa chiền (`TEMPLE_INTRO`) và kinh sách (`SUTRA`) trên `dharma_contents`.
 *
 * Khác phần còn lại của seed:full, đây là NỘI DUNG THẬT dùng được trên staging/production —
 * không tạo người dùng nào (`created_by` NULL), nên chạy riêng được bằng `npm run seed:dharma`
 * mà không cần `SEED_DEMO_DATA`.
 *
 * Về nội dung:
 * - Bát Nhã Tâm Kinh là toàn văn âm Hán-Việt truyền thống.
 * - Các bộ kinh khác là BÀI GIỚI THIỆU kèm đoạn trích ngắn, không phải toàn văn — bản dịch tiếng
 *   Việt của từng dịch giả có bản quyền riêng; ban nội dung thay toàn văn qua CMS.
 * - Chùa: thông tin phổ thông (vị trí, niên đại, điểm nổi bật). Không có toạ độ — bảng chưa có cột.
 *
 * Idempotent: khoá cố định + `ON CONFLICT DO NOTHING` (cả `global_id` lẫn `slug`), nên chạy lại
 * hay chạy sau seed:full (đã có `bat-nha-tam-kinh`, `chua-tran-quoc`) đều không nhân bản.
 */

/** Bắt đầu từ 101 để không đụng bốn nội dung của seed:full (1–4). */
const content = (n: number) => seedId(SeedDomains.dharmaContents, 100 + n);

/**
 * Ảnh GIỮ CHỖ, không phải ảnh thật của chùa — một ảnh phong cảnh bất kỳ gắn vào tên một ngôi
 * chùa có thật là thông tin sai. Ban nội dung tải ảnh thật qua CMS.
 */
const Cover = (slug: string) => `https://placehold.co/800x450.png?text=${slug}`;

export const BatNhaTamKinh = [
  'Quán Tự Tại Bồ Tát hành thâm Bát Nhã Ba La Mật Đa thời, chiếu kiến ngũ uẩn giai không, độ nhất thiết khổ ách.',
  'Xá Lợi Tử! Sắc bất dị không, không bất dị sắc, sắc tức thị không, không tức thị sắc, thọ tưởng hành thức diệc phục như thị.',
  'Xá Lợi Tử! Thị chư pháp không tướng, bất sinh bất diệt, bất cấu bất tịnh, bất tăng bất giảm.',
  'Thị cố không trung vô sắc, vô thọ tưởng hành thức, vô nhãn nhĩ tỷ thiệt thân ý, vô sắc thanh hương vị xúc pháp, vô nhãn giới nãi chí vô ý thức giới, vô vô minh diệc vô vô minh tận, nãi chí vô lão tử diệc vô lão tử tận, vô khổ tập diệt đạo, vô trí diệc vô đắc.',
  'Dĩ vô sở đắc cố, Bồ Đề Tát Đỏa y Bát Nhã Ba La Mật Đa cố, tâm vô quái ngại, vô quái ngại cố, vô hữu khủng bố, viễn ly điên đảo mộng tưởng, cứu cánh Niết Bàn.',
  'Tam thế chư Phật y Bát Nhã Ba La Mật Đa cố, đắc A Nậu Đa La Tam Miệu Tam Bồ Đề.',
  'Cố tri Bát Nhã Ba La Mật Đa, thị đại thần chú, thị đại minh chú, thị vô thượng chú, thị vô đẳng đẳng chú, năng trừ nhất thiết khổ, chân thật bất hư.',
  'Cố thuyết Bát Nhã Ba La Mật Đa chú, tức thuyết chú viết: Yết đế yết đế, ba la yết đế, ba la tăng yết đế, Bồ Đề tát bà ha.',
].join('\n\n');

interface ILibraryItem {
  readonly n: number;
  readonly type: 'SUTRA' | 'TEMPLE_INTRO';
  readonly category: string;
  readonly title: string;
  readonly slug: string;
  readonly summary: string;
  readonly body: string;
  readonly featured?: boolean;
}

export const DharmaSutras: readonly ILibraryItem[] = [
  {
    n: 1,
    type: 'SUTRA',
    category: 'kinh-tung',
    title: 'Bát Nhã Ba La Mật Đa Tâm Kinh',
    slug: 'bat-nha-tam-kinh',
    summary:
      'Bộ kinh ngắn nhất mà cô đọng nhất của hệ Bát Nhã, tụng hằng ngày trong các khoá lễ.',
    body: BatNhaTamKinh,
    featured: true,
  },
  {
    n: 2,
    type: 'SUTRA',
    category: 'kinh-dai-thua',
    title: 'Kinh Kim Cang Bát Nhã Ba La Mật',
    slug: 'kinh-kim-cang',
    summary:
      'Cuộc vấn đáp giữa Đức Phật và Tôn giả Tu Bồ Đề về trí tuệ phá chấp, không trụ vào tướng.',
    body: [
      'Kinh Kim Cang là cuộc vấn đáp giữa Đức Phật và Tôn giả Tu Bồ Đề tại vườn Kỳ Thọ Cấp Cô Độc, nước Xá Vệ. Trọng tâm của kinh là buông bỏ mọi chấp trước vào tướng — tướng ngã, tướng nhân, tướng chúng sinh, tướng thọ giả — để tâm không trụ vào đâu mà vẫn sáng suốt hành thiện.',
      'Bài kệ kết kinh được nhiều người thuộc lòng:',
      'Nhất thiết hữu vi pháp,\nNhư mộng huyễn bào ảnh,\nNhư lộ diệc như điện,\nƯng tác như thị quán.',
      '(Tất cả pháp hữu vi như giấc mộng, như huyễn, như bọt nước, như bóng; như sương mai, như ánh chớp — nên quán chiếu như thế.)',
    ].join('\n\n'),
    featured: true,
  },
  {
    n: 3,
    type: 'SUTRA',
    category: 'kinh-tung',
    title: 'Kinh A Di Đà',
    slug: 'kinh-a-di-da',
    summary:
      'Đức Phật giới thiệu cõi Tây Phương Cực Lạc và pháp môn niệm danh hiệu Phật A Di Đà.',
    body: [
      'Kinh A Di Đà mở đầu: "Như thị ngã văn: Nhất thời Phật tại Xá Vệ quốc, Kỳ Thọ Cấp Cô Độc viên…" Đức Phật tự nói, không đợi ai thưa hỏi, để giới thiệu cõi Cực Lạc ở phương Tây và Đức Phật A Di Đà đang thuyết pháp nơi đó.',
      'Kinh khuyên người nghe phát nguyện vãng sinh và chuyên tâm trì niệm danh hiệu "Nam mô A Di Đà Phật" — pháp môn căn bản của Tịnh Độ tông, được tụng trong khoá lễ chiều và các lễ cầu siêu.',
    ].join('\n\n'),
  },
  {
    n: 4,
    type: 'SUTRA',
    category: 'kinh-tung',
    title: 'Kinh Phổ Môn',
    slug: 'kinh-pho-mon',
    summary:
      'Phẩm thứ 25 kinh Pháp Hoa, nói về hạnh nguyện cứu khổ của Bồ Tát Quán Thế Âm.',
    body: [
      'Kinh Phổ Môn là phẩm "Quán Thế Âm Bồ Tát Phổ Môn" trong kinh Diệu Pháp Liên Hoa. Bồ Tát Vô Tận Ý hỏi Đức Phật vì sao Bồ Tát có tên Quán Thế Âm; Đức Phật dạy rằng chúng sinh gặp khổ nạn, nhất tâm xưng danh Bồ Tát thì Bồ Tát quán xét âm thanh ấy mà cứu độ.',
      'Kinh được tụng nhiều trong các lễ cầu an, ngày vía Quán Thế Âm (19 tháng Hai, 19 tháng Sáu, 19 tháng Chín âm lịch).',
    ].join('\n\n'),
  },
  {
    n: 5,
    type: 'SUTRA',
    category: 'kinh-bao-hieu',
    title: 'Kinh Vu Lan Bồn',
    slug: 'kinh-vu-lan-bon',
    summary:
      'Câu chuyện Tôn giả Mục Kiền Liên cứu mẹ — nguồn gốc mùa Vu Lan báo hiếu rằm tháng Bảy.',
    body: [
      'Tôn giả Mục Kiền Liên, bậc thần thông bậc nhất trong hàng đệ tử Phật, dùng thần lực thấy mẹ đọa làm ngạ quỷ, đói khát khổ sở. Tự sức mình không cứu được, Tôn giả về bạch Phật.',
      'Đức Phật dạy: vào ngày rằm tháng Bảy, ngày chư Tăng mãn hạ an cư, hãy sắm lễ cúng dường mười phương Tăng; nhờ sức chú nguyện của chư Tăng mà cha mẹ hiện tiền và nhiều đời được thoát khổ. Từ đó Vu Lan trở thành mùa báo hiếu của người con Phật.',
    ].join('\n\n'),
    featured: true,
  },
  {
    n: 6,
    type: 'SUTRA',
    category: 'kinh-dai-thua',
    title: 'Kinh Địa Tạng Bồ Tát Bổn Nguyện',
    slug: 'kinh-dia-tang',
    summary:
      'Hạnh nguyện rộng lớn của Bồ Tát Địa Tạng: cứu độ chúng sinh trong cảnh khổ, nhất là cõi u minh.',
    body: [
      'Kinh kể những đời tiền thân của Bồ Tát Địa Tạng — có đời là người con gái hiếu thảo tìm cách cứu mẹ — và lời đại nguyện: "Địa ngục vị không, thệ bất thành Phật; chúng sinh độ tận, phương chứng Bồ Đề" (địa ngục chưa trống thì thề chưa thành Phật; độ hết chúng sinh mới chứng quả Bồ Đề).',
      'Kinh thường được tụng trong tuần thất, lễ cầu siêu và tháng Vu Lan.',
    ].join('\n\n'),
  },
  {
    n: 7,
    type: 'SUTRA',
    category: 'kinh-dai-thua',
    title: 'Kinh Dược Sư',
    slug: 'kinh-duoc-su',
    summary:
      'Mười hai đại nguyện của Đức Phật Dược Sư Lưu Ly Quang — cầu an, cầu bình phục, tiêu tai.',
    body: [
      'Đức Phật giới thiệu cõi Tịnh Lưu Ly ở phương Đông và Đức Phật Dược Sư Lưu Ly Quang Như Lai, người khi còn hành Bồ Tát đạo đã phát mười hai đại nguyện: cho chúng sinh thân tướng đầy đủ, trí tuệ sáng suốt, thoát bệnh khổ, đủ cơm áo, thoát tà kiến và tai nạn…',
      'Kinh được tụng trong các lễ cầu an đầu năm và khi có người thân đau ốm.',
    ].join('\n\n'),
  },
  {
    n: 8,
    type: 'SUTRA',
    category: 'kinh-nguyen-thuy',
    title: 'Kinh Pháp Cú',
    slug: 'kinh-phap-cu',
    summary:
      'Tuyển tập 423 bài kệ ngắn về đạo đức và giải thoát, gần gũi với đời sống hằng ngày.',
    body: [
      'Kinh Pháp Cú (Dhammapada) gồm 26 phẩm, 423 bài kệ do chính Đức Phật nói trong nhiều hoàn cảnh. Mỗi bài kệ ngắn gọn, dễ nhớ, chỉ thẳng vào tâm và hành động.',
      'Bài kệ mở đầu nói về vai trò của tâm ý:',
      'Ý dẫn đầu các pháp,\nÝ làm chủ, ý tạo;\nNếu với ý ô nhiễm,\nNói lên hay hành động,\nKhổ não bước theo sau,\nNhư xe, chân vật kéo.',
    ].join('\n\n'),
  },
  {
    n: 9,
    type: 'SUTRA',
    category: 'kinh-nguyen-thuy',
    title: 'Kinh Chuyển Pháp Luân',
    slug: 'kinh-chuyen-phap-luan',
    summary:
      'Bài pháp đầu tiên tại vườn Lộc Uyển: Tứ Diệu Đế và Bát Chánh Đạo.',
    body: [
      'Sau khi thành đạo, Đức Phật đến vườn Lộc Uyển gần thành Ba La Nại, giảng cho năm anh em Kiều Trần Như bài pháp đầu tiên. Ngài chỉ ra con đường Trung Đạo, xa lìa hai cực đoan hưởng thụ dục lạc và khổ hạnh ép xác.',
      'Tứ Diệu Đế: Khổ đế (sự thật về khổ), Tập đế (nguyên nhân của khổ), Diệt đế (khổ có thể chấm dứt), Đạo đế (con đường chấm dứt khổ).',
      'Bát Chánh Đạo: chánh kiến, chánh tư duy, chánh ngữ, chánh nghiệp, chánh mạng, chánh tinh tấn, chánh niệm, chánh định.',
    ].join('\n\n'),
    featured: true,
  },
  {
    n: 10,
    type: 'SUTRA',
    category: 'kinh-nguyen-thuy',
    title: 'Kinh Từ Bi',
    slug: 'kinh-tu-bi',
    summary:
      'Lời dạy tu tập tâm từ: thương yêu mọi loài như người mẹ thương đứa con duy nhất.',
    body: [
      'Kinh Từ Bi (Metta Sutta) dạy người tu tập trước hết sống ngay thẳng, khiêm nhường, dễ dạy, ít ham muốn; rồi rải tâm từ đến mọi chúng sinh — yếu hay mạnh, lớn hay nhỏ, thấy hay không thấy, gần hay xa — mong tất cả được an vui.',
      'Hình ảnh nổi tiếng của kinh: hãy thương yêu mọi loài như người mẹ sẵn sàng hy sinh tính mạng để che chở đứa con duy nhất của mình.',
    ].join('\n\n'),
  },
  {
    n: 11,
    type: 'SUTRA',
    category: 'kinh-nguyen-thuy',
    title: 'Kinh Thập Thiện',
    slug: 'kinh-thap-thien',
    summary:
      'Mười điều lành làm nền tảng đạo đức cho người tại gia, chia theo thân, khẩu, ý.',
    body: [
      'Đức Phật dạy Long vương rằng mọi cảnh giới tốt xấu đều do tâm tạo, và nền tảng của an lạc là mười nghiệp lành:',
      'Về thân: không sát sinh, không trộm cắp, không tà dâm.\nVề khẩu: không nói dối, không nói hai lưỡi, không nói lời ác, không nói lời thêu dệt.\nVề ý: không tham, không sân, không si.',
    ].join('\n\n'),
  },
  {
    n: 12,
    type: 'SUTRA',
    category: 'kinh-bao-hieu',
    title: 'Kinh Báo Hiếu Phụ Mẫu Trọng Ân',
    slug: 'kinh-bao-hieu-phu-mau',
    summary:
      'Mười ân lớn của cha mẹ và cách người con đền đáp — đọc nhiều trong mùa Vu Lan.',
    body: [
      'Kinh kể công ơn sinh thành dưỡng dục của cha mẹ qua mười ân lớn: ân mang nặng, ân sinh nở đau đớn, ân quên khổ khi con chào đời, ân nhường chỗ khô nằm chỗ ướt, ân nuôi con khôn lớn, ân lo lắng khi con đi xa…',
      'Đức Phật dạy cách đền ơn trọn vẹn nhất là giúp cha mẹ biết điều lành, xa điều dữ, tin hiểu Tam Bảo — ngoài việc phụng dưỡng hằng ngày.',
    ].join('\n\n'),
  },
  {
    n: 13,
    type: 'SUTRA',
    category: 'kinh-tung',
    title: 'Chú Đại Bi',
    slug: 'chu-dai-bi',
    summary:
      'Thần chú của Bồ Tát Quán Thế Âm, gồm 84 câu, trì tụng trong khoá lễ sáng.',
    body: [
      'Chú Đại Bi (Thiên Thủ Thiên Nhãn Vô Ngại Đại Bi Tâm Đà La Ni) do Bồ Tát Quán Thế Âm nói ra, được ghi trong kinh Thiên Thủ Thiên Nhãn. Bản thông dụng ở Việt Nam gồm 84 câu, mở đầu bằng "Nam mô Đại bi Hội thượng Phật Bồ Tát".',
      'Chú được trì tụng trong khoá lễ sáng và các lễ cầu an. Toàn văn chú do ban nội dung cập nhật theo bản chính thức của chùa/giáo hội.',
    ].join('\n\n'),
  },
];

export const DharmaTemples: readonly ILibraryItem[] = [
  {
    n: 51,
    type: 'TEMPLE_INTRO',
    category: 'mien-bac',
    title: 'Chùa Trấn Quốc',
    slug: 'chua-tran-quoc',
    summary:
      'Ngôi chùa cổ nhất Thăng Long – Hà Nội, trên bán đảo nhỏ phía đông Hồ Tây.',
    body: [
      'Địa chỉ: đường Thanh Niên, quận Tây Hồ, Hà Nội.',
      'Chùa có lịch sử khoảng 1.500 năm, ban đầu dựng bên bờ sông Hồng, sau dời vào vị trí hiện nay trên bán đảo Hồ Tây. Nổi bật là bảo tháp lục độ đài sen nhiều tầng và cây bồ đề được chiết từ cây bồ đề nơi Đức Phật thành đạo.',
    ].join('\n\n'),
    featured: true,
  },
  {
    n: 52,
    type: 'TEMPLE_INTRO',
    category: 'mien-bac',
    title: 'Chùa Một Cột (Diên Hựu tự)',
    slug: 'chua-mot-cot',
    summary:
      'Ngôi chùa hình hoa sen nở trên một cột đá giữa hồ, dựng từ thời Lý (năm 1049).',
    body: [
      'Địa chỉ: phố Chùa Một Cột, quận Ba Đình, Hà Nội.',
      'Theo sử cũ, chùa được vua Lý Thái Tông cho dựng năm 1049 sau giấc mộng thấy Bồ Tát Quán Thế Âm ngồi trên tòa sen. Điện thờ nhỏ đặt trên một cột đá giữa hồ vuông, tượng trưng bông sen vươn lên từ mặt nước — biểu tượng của Hà Nội.',
    ].join('\n\n'),
  },
  {
    n: 53,
    type: 'TEMPLE_INTRO',
    category: 'mien-bac',
    title: 'Chùa Hương',
    slug: 'chua-huong',
    summary:
      'Quần thể chùa và hang động ở Hương Sơn, nổi tiếng với lễ hội đầu xuân và động Hương Tích.',
    body: [
      'Địa chỉ: xã Hương Sơn, huyện Mỹ Đức, Hà Nội.',
      'Quần thể gồm nhiều chùa, đền, động trải dọc suối Yến và núi Hương Tích. Du khách thường đi đò theo suối Yến rồi leo núi lên động Hương Tích — được xem là "Nam thiên đệ nhất động". Lễ hội chùa Hương khai mạc mùng 6 tháng Giêng âm lịch và kéo dài tới cuối xuân.',
    ].join('\n\n'),
    featured: true,
  },
  {
    n: 54,
    type: 'TEMPLE_INTRO',
    category: 'mien-bac',
    title: 'Chùa Bái Đính',
    slug: 'chua-bai-dinh',
    summary:
      'Quần thể chùa lớn ở Ninh Bình, gồm khu chùa cổ trên núi và khu chùa mới quy mô lớn.',
    body: [
      'Địa chỉ: xã Gia Sinh, huyện Gia Viễn, tỉnh Ninh Bình.',
      'Khu chùa cổ trên núi Bái Đính gắn với thiền sư Nguyễn Minh Không thời Lý. Khu chùa mới được xây dựng từ năm 2003 với điện Tam Thế, hành lang La Hán dài và bảo tháp nhiều tầng, nằm trong vùng Quần thể danh thắng Tràng An.',
    ].join('\n\n'),
  },
  {
    n: 55,
    type: 'TEMPLE_INTRO',
    category: 'mien-bac',
    title: 'Chùa Tam Chúc',
    slug: 'chua-tam-chuc',
    summary:
      'Quần thể chùa bên hồ Tam Chúc, tựa lưng vào dãy núi đá vôi ở Hà Nam.',
    body: [
      'Địa chỉ: thị trấn Ba Sao, huyện Kim Bảng, tỉnh Hà Nam.',
      'Quần thể chùa nằm giữa hồ nước và núi đá vôi, gồm điện Tam Thế, điện Pháp Chủ, điện Quán Âm cùng vườn cột kinh. Khung cảnh sơn thủy rộng lớn thu hút đông đảo Phật tử và du khách.',
    ].join('\n\n'),
  },
  {
    n: 56,
    type: 'TEMPLE_INTRO',
    category: 'mien-bac',
    title: 'Chùa Đồng – Yên Tử',
    slug: 'chua-dong-yen-tu',
    summary:
      'Đỉnh thiêng Yên Tử, nơi Phật hoàng Trần Nhân Tông tu hành và khai sáng Thiền phái Trúc Lâm.',
    body: [
      'Địa chỉ: núi Yên Tử, thành phố Uông Bí, tỉnh Quảng Ninh.',
      'Yên Tử là trung tâm của Thiền phái Trúc Lâm do vua Trần Nhân Tông khai sáng sau khi xuất gia. Con đường hành hương đi qua chùa Hoa Yên, tháp Tổ… và kết thúc ở chùa Đồng trên đỉnh núi cao hơn 1.000 mét. Mùa lễ hội bắt đầu từ mùng 10 tháng Giêng âm lịch.',
    ].join('\n\n'),
    featured: true,
  },
  {
    n: 57,
    type: 'TEMPLE_INTRO',
    category: 'mien-bac',
    title: 'Chùa Bút Tháp (Ninh Phúc tự)',
    slug: 'chua-but-thap',
    summary:
      'Ngôi chùa cổ ở Bắc Ninh, nổi tiếng với pho tượng Quán Thế Âm nghìn mắt nghìn tay.',
    body: [
      'Địa chỉ: xã Đình Tổ, huyện Thuận Thành, tỉnh Bắc Ninh.',
      'Chùa giữ được kiến trúc gỗ và đá cổ cùng nhiều pho tượng quý, nổi bật nhất là tượng Bồ Tát Quán Thế Âm nghìn mắt nghìn tay — một kiệt tác điêu khắc gỗ của Việt Nam. Cầu đá và tháp Báo Nghiêm trong khuôn viên chùa cũng rất đặc sắc.',
    ].join('\n\n'),
  },
  {
    n: 58,
    type: 'TEMPLE_INTRO',
    category: 'mien-bac',
    title: 'Chùa Dâu (Diên Ứng tự)',
    slug: 'chua-dau',
    summary:
      'Gắn với trung tâm Phật giáo Luy Lâu, được xem là một trong những ngôi chùa sớm nhất Việt Nam.',
    body: [
      'Địa chỉ: xã Thanh Khương, huyện Thuận Thành, tỉnh Bắc Ninh.',
      'Chùa nằm trong vùng Luy Lâu cổ, trung tâm Phật giáo đầu tiên ở nước ta. Chùa thờ Pháp Vân — một trong hệ thống Tứ Pháp (Mây, Mưa, Sấm, Chớp) gắn với tín ngưỡng nông nghiệp của người Việt. Lễ hội chùa Dâu diễn ra ngày mùng 8 tháng Tư âm lịch.',
    ].join('\n\n'),
  },
  {
    n: 59,
    type: 'TEMPLE_INTRO',
    category: 'mien-bac',
    title: 'Chùa Tây Phương',
    slug: 'chua-tay-phuong',
    summary:
      'Ngôi chùa trên núi Câu Lậu, nổi tiếng với hệ thống tượng La Hán bằng gỗ.',
    body: [
      'Địa chỉ: xã Thạch Xá, huyện Thạch Thất, Hà Nội.',
      'Chùa nằm trên đỉnh núi Câu Lậu, đường lên là những bậc đá ong. Kiến trúc mái chồng diêm cùng các pho tượng gỗ, đặc biệt là bộ tượng La Hán với nét mặt sinh động, được xem là tinh hoa điêu khắc thời Hậu Lê – Tây Sơn.',
    ].join('\n\n'),
  },
  {
    n: 60,
    type: 'TEMPLE_INTRO',
    category: 'mien-bac',
    title: 'Chùa Keo (Thần Quang tự)',
    slug: 'chua-keo',
    summary: 'Ngôi chùa ở Thái Bình có gác chuông gỗ nhiều tầng nổi tiếng.',
    body: [
      'Địa chỉ: xã Duy Nhất, huyện Vũ Thư, tỉnh Thái Bình.',
      'Chùa thờ Phật và thiền sư Dương Không Lộ thời Lý. Gác chuông chùa Keo bằng gỗ với kết cấu mộng ghép tinh xảo là một trong những công trình kiến trúc gỗ cổ tiêu biểu của Việt Nam.',
    ].join('\n\n'),
  },
  {
    n: 61,
    type: 'TEMPLE_INTRO',
    category: 'mien-trung',
    title: 'Chùa Thiên Mụ',
    slug: 'chua-thien-mu',
    summary:
      'Ngôi chùa bên bờ sông Hương, dựng năm 1601, với tháp Phước Duyên bảy tầng.',
    body: [
      'Địa chỉ: đồi Hà Khê, bờ bắc sông Hương, thành phố Huế.',
      'Chùa được chúa Nguyễn Hoàng cho dựng năm 1601. Tháp Phước Duyên bảy tầng, mỗi tầng thờ một vị Phật, là hình ảnh quen thuộc của xứ Huế. Chùa còn lưu giữ nhiều bia đá và chuông đồng cổ.',
    ].join('\n\n'),
    featured: true,
  },
  {
    n: 62,
    type: 'TEMPLE_INTRO',
    category: 'mien-trung',
    title: 'Chùa Linh Ứng Bãi Bụt',
    slug: 'chua-linh-ung-bai-but',
    summary:
      'Chùa trên bán đảo Sơn Trà, Đà Nẵng, với tượng Quán Thế Âm hướng ra biển.',
    body: [
      'Địa chỉ: bán đảo Sơn Trà, quận Sơn Trà, thành phố Đà Nẵng.',
      'Chùa tựa lưng vào núi Sơn Trà, mặt hướng ra biển Đông. Tượng Bồ Tát Quán Thế Âm cao khoảng 67 mét đứng trên tòa sen, hướng ra biển như che chở cho ngư dân. Từ sân chùa có thể ngắm toàn cảnh vịnh Đà Nẵng.',
    ].join('\n\n'),
  },
  {
    n: 63,
    type: 'TEMPLE_INTRO',
    category: 'mien-nam',
    title: 'Thiền viện Trúc Lâm Đà Lạt',
    slug: 'thien-vien-truc-lam-da-lat',
    summary: 'Thiền viện trên núi Phụng Hoàng, nhìn xuống hồ Tuyền Lâm.',
    body: [
      'Địa chỉ: núi Phụng Hoàng, hồ Tuyền Lâm, thành phố Đà Lạt, tỉnh Lâm Đồng.',
      'Thiền viện tu theo Thiền phái Trúc Lâm, khuôn viên rộng với nhiều vườn hoa giữa rừng thông. Du khách có thể đi cáp treo từ đèo Prenn lên thiền viện và ngắm toàn cảnh hồ Tuyền Lâm.',
    ].join('\n\n'),
  },
  {
    n: 64,
    type: 'TEMPLE_INTRO',
    category: 'mien-nam',
    title: 'Chùa Linh Phước',
    slug: 'chua-linh-phuoc',
    summary: 'Ngôi chùa khảm sành sứ độc đáo ở Trại Mát, Đà Lạt.',
    body: [
      'Địa chỉ: khu Trại Mát, thành phố Đà Lạt, tỉnh Lâm Đồng.',
      'Chùa nổi bật với lối trang trí khảm mảnh sành sứ, chai lọ trên khắp các công trình — từ rồng, tháp chuông đến tượng Phật — nên còn được gọi vui là "chùa Ve Chai".',
    ].join('\n\n'),
  },
  {
    n: 65,
    type: 'TEMPLE_INTRO',
    category: 'mien-nam',
    title: 'Chùa Vĩnh Nghiêm',
    slug: 'chua-vinh-nghiem',
    summary:
      'Ngôi chùa lớn giữa trung tâm TP. Hồ Chí Minh, mang phong cách kiến trúc miền Bắc.',
    body: [
      'Địa chỉ: đường Nam Kỳ Khởi Nghĩa, Quận 3, TP. Hồ Chí Minh.',
      'Chùa được xây dựng vào thập niên 1960, mang tên chùa Vĩnh Nghiêm ở Bắc Giang — tổ đình của Thiền phái Trúc Lâm. Nổi bật là tháp Quan Âm nhiều tầng và đại hồng chung lớn.',
    ].join('\n\n'),
  },
  {
    n: 66,
    type: 'TEMPLE_INTRO',
    category: 'mien-nam',
    title: 'Chùa Giác Lâm',
    slug: 'chua-giac-lam',
    summary:
      'Một trong những ngôi chùa cổ nhất Sài Gòn – Gia Định, dựng từ thế kỷ XVIII.',
    body: [
      'Địa chỉ: đường Lạc Long Quân, quận Tân Bình, TP. Hồ Chí Minh.',
      'Chùa được dựng vào khoảng năm 1744, còn giữ nhiều tượng gỗ, hoành phi, câu đối cổ. Bảo tháp nhiều tầng trong khuôn viên là điểm nhấn của chùa giữa lòng thành phố.',
    ].join('\n\n'),
  },
];

export const DharmaLibrary: readonly ILibraryItem[] = [
  ...DharmaSutras,
  ...DharmaTemples,
];

type Query = (sql: string, params?: unknown[]) => Promise<unknown>;

/**
 * Ghi thư viện. Trả số dòng MỚI chèn (nội dung đã có — theo id hoặc slug — được giữ nguyên, kể
 * cả khi ban nội dung đã sửa qua CMS).
 */
export async function seedDharmaLibrary(query: Query): Promise<number> {
  let inserted = 0;
  for (const [index, item] of DharmaLibrary.entries()) {
    const rows = (await query(
      `
        INSERT INTO dharma_contents (
          global_id, content_type, category, title, slug, summary, body_text,
          cover_url, display_order, is_featured, is_published, published_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, now())
        ON CONFLICT DO NOTHING
        RETURNING global_id
      `,
      [
        content(item.n),
        item.type,
        item.category,
        item.title,
        item.slug,
        item.summary,
        item.body,
        Cover(item.slug),
        // Thứ tự hiển thị theo vị trí trong danh sách, cách 10 để Admin chèn giữa được.
        (index + 1) * 10,
        item.featured ?? false,
      ],
    )) as unknown[];
    inserted += rows.length;
  }
  return inserted;
}
