Đọc tập truyện dưới đây và trả về bốn thứ: một dòng mục lục, tóm tắt tập, trạng thái các nhân vật, và danh sách sự kiện rời.

## `gist` — một câu, tối đa 20 từ

Nêu VIỆC CHÍNH của tập. Đây là dòng mục lục, luôn được nạp khi viết các tập sau, nên phải đủ để nhận ra tập này nói về chuyện gì.

Ví dụ: "Tài chở người khách cuối cùng về Bến Cũ và phát hiện ghế số 12 trống."

## `summary` — tóm tắt tập, 150–250 từ

Bản tóm tắt này nạp làm ngữ cảnh khi viết các tập sau, nên phải nêu rõ:
- Việc gì đã xảy ra, theo trình tự
- Tình tiết còn bỏ ngỏ

Không bình luận, không đánh giá. Chỉ thuật lại.

## `characters` — trạng thái cuối tập

Chỉ liệt kê nhân vật CÓ XUẤT HIỆN trong tập này. Với mỗi người, ghi tình trạng ở thời điểm tập kết thúc:
- Đang ở đâu
- Biết điều gì mà trước đó chưa biết
- Quan hệ với nhân vật khác đã thay đổi thế nào
- Còn sống không, có thương tích gì không

Viết ngắn gọn, mỗi người 1–2 câu. Đây là thứ giúp các tập sau không viết sai — ví dụ không để một nhân vật đã chết xuất hiện, hay để hai người vừa cãi nhau lại thân thiết.

Dùng đúng TÊN nhân vật trong danh sách dưới đây, không tự đặt tên khác.

## `facts` — sự kiện rời

Tách tập thành các sự kiện, mỗi sự kiện MỘT câu. Đây là thứ được truy hồi khi viết các tập sau, nên mỗi câu phải **tự đứng được mà không cần đọc lại tập**: nêu rõ tên nhân vật và địa điểm, đừng dùng "anh ta", "ở đó".

Phân loại đúng `kind`, vì cách dùng khác nhau:

| kind | Khi nào | Ví dụ |
|---|---|---|
| `EVENT` | Việc đã xảy ra | "Tài chở người khách cuối cùng về Bến Cũ lúc 2 giờ sáng." |
| `REVELATION` | Nhân vật phát hiện điều gì | "Tài phát hiện ghế số 12 chưa từng có ai ngồi." |
| `PROMISE` | Lời thề, lời hứa, cam kết | "Tài thề không bao giờ quay lại Bến Cũ." |
| `RELATION` | Quan hệ thay đổi | "Tài không còn tin lời ông Bảy sau đêm đó." |
| `OBJECT` | Vật quan trọng xuất hiện | "Chiếc vé xe cũ ghi ngày 30 tháng Chạp năm 1975." |
| `PLACE` | Địa điểm có ý nghĩa được giới thiệu | "Bến Cũ nằm ngoài rìa thị trấn, bỏ hoang từ sau cơn bão." |
| `OPEN_THREAD` | **Tình tiết bỏ ngỏ, chưa có lời giải** | "Không ai biết ai đã mua vé ghế số 12." |

`OPEN_THREAD` quan trọng nhất — đó là món nợ câu chuyện phải trả, và nó luôn được nạp khi viết các tập sau. Đừng bỏ sót.

Mỗi tập thường có 5–12 sự kiện. Đừng liệt kê chi tiết không ảnh hưởng gì về sau (thời tiết, mô tả cảnh vật).

## Nhân vật trong truyện

{{characters}}

## Nội dung tập

{{text}}

Trả về JSON đúng schema.
