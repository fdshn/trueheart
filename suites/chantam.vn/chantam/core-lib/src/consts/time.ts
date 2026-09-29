/**
 * Múi giờ nghiệp vụ của Chân Tâm.
 *
 * Mọi ranh giới NGÀY phải cắt theo múi này, không theo UTC: người dùng ở Việt
 * Nam, và cắt theo UTC thì "ngày" của hệ thống bắt đầu lúc 7 giờ sáng. Hệ quả
 * rất cụ thể — trần điểm mỗi ngày sẽ reset vào 7h sáng, nên ai tặng đồ sáng sớm
 * Chủ nhật lại đang ăn vào quota của thứ Bảy.
 *
 * Một hằng dùng chung chứ không viết thẳng chuỗi ở từng chỗ: trước đây ba nơi
 * tự khai riêng, và một nơi trong số đó khai UTC.
 */
export const BusinessTimeZone = 'Asia/Ho_Chi_Minh';
