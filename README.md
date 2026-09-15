# Thiên Nam — Discord → Supabase → Website

Bản này dùng **Supabase Edge Function**, không dùng Vercel.

Luồng hoạt động:

Discord channel `1537978516812079174`
→ Supabase Edge Function `discord-members`
→ Discord REST API
→ Supabase table `tn_discord_members`
→ Website Thiên Nam.

## 1. Tạo bảng

Mở Supabase Dashboard → SQL Editor → chạy file:

`supabase/migrations/001_tn_discord_members.sql`

## 2. Tạo Edge Function

Tạo function tên:

`discord-members`

và đặt code từ:

`supabase/functions/discord-members/index.ts`

Function URL sau khi deploy:

`https://fjaqtmamsfhtkcscmrjl.supabase.co/functions/v1/discord-members`

## 3. Thêm Secret

Supabase Dashboard → Edge Functions → Secrets → thêm:

`DISCORD_BOT_TOKEN = Bot Token của bot Discord`

Không đưa token này vào HTML/GitHub.

## 4. Quyền Discord

Bot phải được mời vào server và có quyền ở channel `1537978516812079174`:

- View Channel
- Read Message History

Nếu bot cần đọc nội dung tin nhắn qua các API/luồng bị giới hạn, bật **Message Content Intent** trong Discord Developer Portal.

## 5. Định dạng tin nhắn

Hỗ trợ:

Tên: Hàn Phong
UID: 123456789012345678
Vai trò: DPS
Khung giờ: 19:30, 20:00

hoặc một dòng:

Tên: Hàn Phong | UID: 123456789012345678 | Vai trò: DPS | Khung giờ: 19:30,20:00

Nếu thiếu Tên/UID, function sẽ lấy thông tin từ author Discord khi có thể.

## 6. Website

`index.html` đã được nối API tới Supabase Edge Function và gửi publishable key trong header `apikey`.

Không có secret/service-role key trong HTML.

## 7. Deploy

Có thể deploy function bằng Supabase Dashboard hoặc Supabase CLI.

CLI:

`supabase functions deploy discord-members`

Sau khi deploy, website có thể gọi:

`GET /functions/v1/discord-members?channel_id=1537978516812079174`

## Lưu ý

Supabase Edge Functions là endpoint HTTP ngắn hạn; bản này đồng bộ khi website gọi API (website hiện gọi tự động định kỳ). Đây không phải một Gateway bot chạy WebSocket liên tục.
