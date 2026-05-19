# Huong Dan Thiet Lap Android SMS Gateway

> Bien dien thoai Android thanh API Server de gui SMS thong qua SIM vat ly.

---

## Muc Luc

1. [Tong quan kien truc](#1-tong-quan-kien-truc)
2. [Chuan bi thiet bi](#2-chuan-bi-thiet-bi)
3. [Cai dat ung dung SMS Gateway](#3-cai-dat-ung-dung-sms-gateway)
4. [Cap quyen cho ung dung](#4-cap-quyen-cho-ung-dung)
5. [Bat HTTP Server](#5-bat-http-server)
6. [Cau hinh mang](#6-cau-hinh-mang)
7. [Cau hinh FastAPI Backend](#7-cau-hinh-fastapi-backend)
8. [Test gui SMS](#8-test-gui-sms)
9. [Bao mat](#9-bao-mat)
10. [Trang thai SMS](#10-trang-thai-sms)
11. [Rate Limit va Chong gui trung](#11-rate-limit-va-chong-gui-trung)
12. [Quan ly thiet bi (Multi-device)](#12-quan-ly-thiet-bi-multi-device)
13. [Audit Log](#13-audit-log)
14. [An toan va Tuan thu](#14-an-toan-va-tuan-thu)
15. [Xu ly su co](#15-xu-ly-su-co)
16. [API Endpoints](#16-api-endpoints)

---

## 1. Tong Quan Kien Truc

```
                           Rate Limit
                           Idempotency
                              |
Frontend/External  ──POST──>  FastAPI  ──BackgroundTask──> Android Phone ──SIM──> Nha Mang
                              |                              |
                         gateway_sms_logs               SMS Message
                         audit_logs                         |
                         gateway_devices                    v
                              |                        Nguoi nhan
                         Startup Worker
                         (pickup pending/retrying)
```

**Luong hoat dong:**
1. Frontend/External gui request toi FastAPI (`POST /api/gateway/send-sms`)
2. FastAPI kiem tra: idempotency → rate limit → quota
3. Tao ban ghi log (status: `pending`) va tra ve ngay cho client
4. Background task gui HTTP POST toi Android SMS Gateway
5. Luu gateway_response, cap nhat trang thai
6. Neu loi tam thoi → retry voi backoff (60s → 300s → 900s)
7. Neu server restart → startup worker pickup pending/retrying records

---

## 2. Chuan Bi Thiet Bi

| Yeu cau | Chi tiet |
|---------|---------|
| **Dien thoai Android** | Android 6.0 tro len. Khong can root. |
| **SIM hoat dong** | Co goi SMS hoac du tien trong tai khoan. |
| **Ket noi mang** | WiFi hoac LAN, cung mang voi may chu FastAPI. |
| **Nguon dien** | Cam sac lien tuc de tranh tat may dot ngot. |
| **Tat tiet kiem pin** | Settings > Battery > tat Battery Optimization cho app. |

---

## 3. Cai Dat Ung Dung SMS Gateway

| Ung dung | Ma nguon | Ghi chu |
|----------|----------|---------|
| **SMS Gate** | Mo (GitHub) | Duoc khuyen nghi. HTTP API don gian. |
| **Traccar SMS Gateway** | Mo | Chuyen cho GPS nhung API tuong thich. |
| **SMS Gateway (capcom6)** | Mo (GitHub) | REST API day du, ho tro webhook. |

1. Mo **Google Play Store** tren dien thoai Android
2. Tim kiem ten ung dung (vi du: "SMS Gate")
3. Nhan **Install** va doi cai dat hoan tat
4. Mo ung dung

---

## 4. Cap Quyen Cho Ung Dung

| Quyen | Bat buoc | Muc dich |
|-------|----------|----------|
| `SEND_SMS` | Yes | Cho phep gui tin nhan SMS |
| `READ_PHONE_STATE` | Yes | Doc thong tin SIM card |
| `INTERNET` | Yes | Cho phep chay HTTP server |
| `READ_SMS` | No (tuy chon) | Doc tin nhan tra loi |
| `RECEIVE_SMS` | No (tuy chon) | Nhan tin nhan den |

1. Mo ung dung SMS Gateway
2. Khi xuat hien dialog yeu cau quyen → nhan **Allow**
3. Vao **Settings > Apps > [Ten app] > Permissions** de kiem tra
4. Dam bao chon **"Allow all the time"** cho quyen SMS
5. Tat **Battery Optimization**: Settings > Apps > [Ten app] > Battery > **Unrestricted**

---

## 5. Bat HTTP Server

1. Mo ung dung SMS Gateway
2. Tim muc **"Server"** hoac **"HTTP Server"** hoac **"API Settings"**
3. Bat cong tac **Enable HTTP Server**
4. Chon **Port** (mac dinh: `8080`)
5. Ung dung se hien thi **dia chi IP noi bo**, vi du:

```
http://192.168.1.100:8080
```

### Kiem tra nhanh

Tren may tinh (cung mang WiFi), mo trinh duyet va truy cap:

```
http://192.168.1.100:8080
```

Neu thay trang web hoac thong bao "API is running" → thanh cong!

---

## 6. Cau Hinh Mang



### Truong hop 1: FastAPI chay tren Cloud/VPS (Khuyen nghi su dung Tailscale )

De he thong hoat dong on dinh va bao mat khi backend nam tren Cloud/VPS, dien thoai Android nam sau NAT (mang gia dinh) thi **Tailscale** la lua chon toi uu:

| Giai phap | Do kho | Bao mat | Ghi chu |
|-----------|--------|---------|---------|
| **Tailscale (Uu tien)** | De | Cao | De cai dat, quan ly truc quan, khuyen dung nhat |

| **WireGuard VPN** | Trung binh | Cao | Hieu nang cao, can tu setup |

#### Cac thanh phan kien truc khi deploy len VPS
```
Frontend / Web Admin (https://api.yourdomain.com)
        ↓
FastAPI tren VPS (127.0.0.1:8000 qua Nginx)
        ↓
Tailscale / ZeroTier private network
        ↓
Android Phone chay SMS Gateway (IP Tailscale 100.x.x.x)
        ↓
SIM vat ly gui SMS
```

**Huong dan chi tiet (Su dung Tailscale):**

1. **Tren dien thoai Android**:
   - Vao CH Play, cai dat **Tailscale** va dang nhap.
   - Bat ket noi Tailscale va ghi lai IP (thuong co dang `100.x.x.x`).
   - Mo Traccar SMS Gateway > Enable HTTP Server.
   - Bay gio URL se la: `http://100.x.x.x:8082` (thay port neu can).

2. **Tren VPS**:
   - Cai Tailscale va dang nhap vao cung mang.
   - Chay kiem tra: `curl http://100.x.x.x:8082` (Ghi vao `.env.production` hoac nhap vao giao dien tao Device).

3. **Chay FastAPI qua systemd tren VPS**:
   - Tao file `/etc/systemd/system/sms-gateway.service`:
     ```ini
     [Unit]
     Description=SMS Gateway FastAPI
     After=network.target

     [Service]
     WorkingDirectory=/var/www/sms-gateway/backend
     EnvironmentFile=/var/www/sms-gateway/backend/.env.production
     ExecStart=/var/www/sms-gateway/backend/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
     Restart=always
     RestartSec=5

     [Install]
     WantedBy=multi-user.target
     ```
   - Chay lenh: `sudo systemctl daemon-reload && sudo systemctl enable sms-gateway && sudo systemctl start sms-gateway`

4. **Cau hinh Nginx + HTTPS**:
   - Tao file config `/etc/nginx/sites-available/sms-gateway`:
     ```nginx
     server {
         server_name api.yourdomain.com;
         location / {
             proxy_pass http://127.0.0.1:8000;
             proxy_set_header Host $host;
             proxy_set_header X-Real-IP $remote_addr;
             proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
             proxy_set_header X-Forwarded-Proto $scheme;
         }
     }
     ```
   - Cai HTTPS: `sudo certbot --nginx -d api.yourdomain.com`

5. **Cau hinh Frontend**:
   - Tren Frontend, chi can tro ve: `VITE_API_BASE_URL=https://api.yourdomain.com`
   - Tuyet doi khong goi truc tiep `http://100.x.x.x:8082` tu frontend.

---

## 7. Cau Hinh FastAPI Backend

### 7.1. Cai dat dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 7.2. Cau hinh file `.env`

```env
# Dia chi API cua Android SMS Gateway
ANDROID_SMS_API_URL=http://100.120.152.19:8082/

# API Key khi FastAPI goi Android Gateway (de trong neu app khong ho tro)
ANDROID_SMS_API_KEY=

# API Key cho external systems goi FastAPI
SMS_API_KEY=your-strong-api-key-here

# Rate limiting
MAX_SMS_RETRIES=3
SMS_RATE_LIMIT_PER_MINUTE=30
SMS_RATE_LIMIT_PER_PHONE=3

# Database
DATABASE_URL=sqlite:///./sms_auto.db

# JWT Secret
SECRET_KEY=your-super-secret-jwt-key
```

> **WARNING:** `SECRET_KEY` is required. If it is not set in `.env`, the backend will refuse to start. Make sure to set a strong secret before deploying to production.

> **QUAN TRONG:** Thay doi `SMS_API_KEY` va `SECRET_KEY` thanh gia tri manh truoc khi trien khai!

### 7.3. Khoi dong server

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 7.4. Kiem tra API docs

Truy cap `http://127.0.0.1:8000/docs` de xem Swagger UI.

---

## 8. Test Gui SMS

### Su dung curl (voi API Key)

```bash
curl -X POST http://127.0.0.1:8000/api/gateway/send-sms-external \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-strong-api-key-here" \
  -d '{
    "phone_number": "0901234567",
    "message": "Test SMS tu Gateway.",
    "request_id": "test-001"
  }'
```

### Kiem tra idempotency (gui cung request_id 2 lan)

```bash
# Lan 1: tao moi
curl -X POST .../send-sms-external \
  -H "X-API-Key: ..." \
  -d '{"phone_number":"090...","message":"test","request_id":"req-001"}'
# Response: {"status": "accepted", ...}

# Lan 2: khong tao trung
curl -X POST .../send-sms-external \
  -H "X-API-Key: ..." \
  -d '{"phone_number":"090...","message":"test","request_id":"req-001"}'
# Response: {"status": "already_exists", ...}
```

### Kiem tra trang thai

```bash
curl http://127.0.0.1:8000/api/gateway/logs \
  -H "Authorization: Bearer $TOKEN"
```

### Health check

```bash
# Backend health (khong can auth)
curl http://127.0.0.1:8000/api/gateway/health

# Device health (can JWT)
curl http://127.0.0.1:8000/api/gateway/device-health \
  -H "Authorization: Bearer $TOKEN"
```

---

## 9. Bao Mat

### 3 lop bao mat

**Lop 1: Frontend/External → FastAPI**
- Frontend → JWT (Bearer token)
- External system → X-API-Key header

**Lop 2: FastAPI → Android Gateway**
- X-API-Key header (env: `ANDROID_SMS_API_KEY`)
- Hoac Basic Auth neu app Android ho tro

**Lop 3: Mang**
- LAN rieng / VPN / ZeroTier / Tailscale / Firewall / HTTPS

### Checklist bao mat bat buoc

- [ ] Thay doi `SMS_API_KEY` trong `.env`
- [ ] Thay doi `SECRET_KEY` trong `.env`
- [ ] Thay doi mat khau admin mac dinh (`admin123`)
- [ ] Khong commit file `.env` len Git (da co trong `.gitignore`)
- [ ] Khong mo Android SMS Gateway truc tiep ra internet
- [ ] Neu dung public IP: bat HTTPS (reverse proxy nginx + certbot)
- [ ] Gioi han IP truy cap neu co the (firewall rules)

---

## 10. Trang Thai SMS

### Status flow

```
pending → queued → sending → gateway_accepted / sent
                           → failed
                           → retrying → (quay lai sending)
pending/queued → cancelled (admin huy)
```

### Giai thich trang thai

| Status | Y nghia |
|--------|---------|
| `pending` | Vua tao yeu cau, chua gui |
| `queued` | Da dua vao hang doi xu ly |
| `sending` | Dang POST toi Android Gateway |
| `gateway_accepted` | Android app da nhan request (HTTP 200) |
| `sent` | Tuong duong gateway_accepted (xem ghi chu ben duoi) |
| `failed` | Gui that bai sau so lan retry toi da |
| `retrying` | Gui loi tam thoi, se thu lai |
| `cancelled` | Bi huy boi admin |

> **QUAN TRONG:**
> Trang thai `gateway_accepted` / `sent` chi nghia la **Android SMS Gateway da chap nhan yeu cau gui**.
> Dieu nay **KHONG dam bao 100%** nguoi nhan da nhan duoc SMS, vi:
> - Nha mang co the chan tin nhan
> - So dien thoai khong ton tai
> - SIM het tien giua chung
>
> Neu ung dung Android khong ho tro delivery report (callback),
> he thong khong the biet chinh xac tin da den tay nguoi nhan hay chua.

---

## 11. Rate Limit va Chong Gui Trung

> [!IMPORTANT]
> **CẤU HÌNH THỬ NGHIỆM (TESTING ENVIRONMENT BYPASS)**:
> Hiện tại, ba lớp kiểm tra trùng lặp và giới hạn gửi tin nhắn đã được **tạm thời vô hiệu hóa (comment out)** để phục vụ quá trình test gửi lặp số:
> 
> 1. **Lọc trùng số điện thoại trong file (Frontend)**: Vô hiệu hóa ở [fileParser.js](file:///d:/Tool%20SMS/frontend/src/utils/fileParser.js#L173-L180).
> 2. **Chống gửi lặp request_id (Backend)**: Vô hiệu hóa ở [sms.py](file:///d:/Tool%20SMS/backend/routers/gateway/sms.py#L24-L35).
> 3. **Giới hạn số lượng tin/10 phút gửi cho 1 số (Backend)**: Vô hiệu hóa ở [rate_limiter.py](file:///d:/Tool%20SMS/backend/services/rate_limiter.py#L81-L86).
> 
> *Lưu ý: Hãy bỏ comment và khôi phục các hàm này khi chạy chính thức.*

### Rate limit 3 tang

| Tang | Gioi han | Mac dinh | Env var |
|------|----------|----------|---------|
| Toan he thong | X tin/phut | 30 | `SMS_RATE_LIMIT_PER_MINUTE` |
| Theo so dien thoai | X tin/10 phut cho 1 so | 3 | `SMS_RATE_LIMIT_PER_PHONE` |
| Theo user | monthly_quota | 1000 | (DB) |

**Muc dich:** Bao ve he thong, tranh gui nham hang loat, tuan thu quy dinh nha mang, va chi gui tin cho nguoi da dong y nhan SMS.

### Chong gui trung (Idempotency)

- Moi request co the kem theo `request_id` (tuy chon).
- Neu `request_id` da ton tai trong DB → tra ve log cu, **KHONG tao SMS moi**.
- Dieu nay bao ve khi frontend gui 2 lan do mang lag hoac user bam nhieu lan.

### Retry thong minh

| Loi | Retry? | Vi du |
|-----|--------|-------|
| Timeout | Co | Mang cham |
| Connection error | Co | Android mat ket noi |
| HTTP 5xx | Co | Gateway tam thoi loi |
| HTTP 400 | Khong | Phone/message khong hop le |
| HTTP 401/403 | Khong | Sai API key |
| HTTP 404 | Khong | Endpoint khong ton tai |
| HTTP 422 | Khong | Du lieu khong dung dinh dang |

**Backoff schedule:** 60s → 300s → 900s (configurable qua `MAX_SMS_RETRIES`)

---

## 12. Quan Ly Thiet Bi (Multi-device)

He thong ho tro nhieu dien thoai Android (multi-device).

### API quan ly

```bash
# Them thiet bi
curl -X POST .../api/gateway/devices \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"Android Phone 1","base_url":"http://192.168.1.100:8080"}'

# Xem danh sach
curl .../api/gateway/devices -H "Authorization: Bearer $ADMIN_TOKEN"

# Cap nhat
curl -X PUT .../api/gateway/devices/{id} \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"is_active": false}'
```

### Loi ich

- Them nhieu dien thoai/SIM
- Chon thiet bi online de gui
- Chia tai theo thiet bi
- Tam khoa thiet bi bi loi

---

## 13. Audit Log

He thong ghi lai hanh dong quan tri de truy vet:

| Action | Mo ta |
|--------|-------|
| `sms.send` | User gui SMS |
| `sms.send_external` | He thong ngoai gui SMS |
| `sms.retry` | Admin gui lai SMS failed |
| `sms.cancel` | Admin huy SMS pending |
| `settings.update` | Admin thay doi cau hinh gateway |
| `device.create` | Admin them thiet bi |
| `device.update` | Admin sua thiet bi |

Moi dong ghi lai: user_id, action, target, details (JSON), IP address, timestamp.

---

## 14. An Toan va Tuan Thu

### Nguyen tac bat buoc

1. **Chi gui SMS cho nguoi da dong y nhan tin** (opt-in). Day la yeu cau phap ly va dao duc.
2. **Khong su dung he thong de gui tin rac (spam).** Vi pham co the dan den:
   - SIM bi khoa vinh vien boi nha mang
   - Vi pham phap luat ve chong spam
3. **Rate limit nhằm bao ve he thong**, tranh gui nham hang loat, tuan thu quy dinh nha mang.
4. **Khong nen gui qua 30 tin/phut** hoac **200 tin/ngay** (tuy nha mang).
5. **Giu noi dung tin nhan ro rang**, co ten to chuc/thuong hieu gui.

---

## 15. Xu Ly Su Co

| Trieu chung | Nguyen nhan | Giai phap |
|------------|-------------|-----------|
| Connection refused | HTTP Server chua bat | Mo app → bat Server |
| Timeout | Sai IP hoac khac mang | Kiem tra IP, ping thu |
| 403 Forbidden | Sai API Key | Kiem tra header X-API-Key |
| SMS khong di | SIM het tien/goi | Kiem tra tai khoan SIM |
| SMS bi chan | Gui qua nhieu tin | Tang delay, giam toc do gui |
| Status ket pending | Server restart giua luc gui | Worker se tu dong pickup |
| Rate limit 429 | Vuot gioi han | Doi va thu lai sau |

### Kiem tra ket noi co ban

```bash
# Ping toi dien thoai
ping 192.168.1.100

# Test HTTP connection
curl http://192.168.1.100:8080

# Health check qua API
curl http://127.0.0.1:8000/api/gateway/health
curl http://127.0.0.1:8000/api/gateway/device-health -H "Authorization: Bearer $TOKEN"
```

### Phan tich chuyen sau: SMS khong toi nguoi nhan

Trong truong hop log ghi nhan trang thai **Gateway da nhan (HTTP 200 OK)** nhung tren thuc te tin nhan khong den duoc dien thoai, van de thuong nam o phia thiet bi Android Gateway chu khong phai backend hay frontend. Ban can lam cac buoc sau:

1. **Kiem tra truc tiep app Gateway tren Android (VD: Traccar SMS Gateway)**:
   - Gateway tra ve HTTP 200 (voi body rong) chi co nghia la app tren dien thoai da nhan request. No chua the hien SMS da duoc gui qua song di dong.
   - Kiem tra xem app tren Android co bi "ngu dong" khong. (Tat Battery Optimization / Chon "Unrestricted").
   - Kiem tra quyen (Permissions) gui SMS tren dien thoai da duoc cap day du cho ung dung gateway hay chua.
   
2. **Kiem tra SIM va nha mang**:
   - SIM trong dien thoai Gateway co the da het tien hoac het goi cuoc.
   - Nhan tin truc tiep bang app tin nhan mac dinh cua may de xem nha mang co chan (chong spam) hay khong.

3. **Kiem tra cac Endpoint khi dung Cloud Service / Sim Farm**:
   - Khi cau hinh ung dung co nhieu endpoint (VD: 1 local IP va 2 public IP), uu tien chon va kiem tra **Local IP** (nhung IP dang `192.168.x.x` hoac `10.x.x.x`) vi chung on dinh nhat neu may chu va dien thoai cung ket noi chung mot mang WiFi/LAN.
   - Cac Public IP thuong xuyen bi Timeout do firewall hoac setup mang mang tinh tam thoi.
   - De kiem tra xem endpoint nao dang ket noi, viet 1 doan script nho bang python thu gui GET request (voi timeout=5) toi tat ca cac URL. URL nao tra ve HTTP 200 thi dung URL do làm `base_url` cho thiet bi.
   - Nen de-active cac thiet bi su dung Public IP Timeout de tang toc he thong retry.

### Case Study: Lỗi cấu hình thiếu API Key trên VPS (Traccar trả về 401)

**Tình huống:** Frontend báo trạng thái "gateway_accepted" nhưng thực tế điện thoại không nhận được SMS. 

**Nguyên nhân gốc rễ:** Khi deploy lên VPS Linux, file cấu hình của backend (`/var/www/sms-gateway/backend/.env`) bị thiếu biến `ANDROID_SMS_API_KEY`. Do đó, khi backend gọi sang Traccar Android Gateway, request bị thiếu header `Authorization: <key>`. Traccar Gateway từ chối yêu cầu và trả về lỗi `HTTP/1.1 401 Unauthorized`. 
*(Lưu ý: Trạng thái `gateway_accepted` đôi khi gây nhầm lẫn là đã gửi thành công, nhưng thực tế nó chỉ có nghĩa là đã kết nối được tới Android Gateway. Nếu thiếu Key hoặc bị lỗi cấu hình, SMS vẫn không đến tay người nhận).*

**Cách khắc phục và Checklist tránh lỗi:**

Mỗi lần thay đổi thiết bị Gateway, đổi IP Tailscale, đổi cổng, hoặc tạo API Key mới, hãy thực hiện đúng checklist sau trên VPS:

1. **Kiểm tra file `.env` của backend:**
   ```bash
   cd /var/www/sms-gateway/backend
   cat .env
   ```
   Đảm bảo có đủ 2 dòng cấu hình bắt buộc:
   ```env
   ANDROID_SMS_API_URL=http://100.120.152.19:8082/
   ANDROID_SMS_API_KEY=key_trong_app_Traccar
   ```

2. **Test trực tiếp Traccar Gateway bằng cURL (từ VPS):**
   ```bash
   curl -v -X POST "http://100.120.152.19:8082/" \
     -H "Content-Type: application/json" \
     -H "Authorization: <key_trong_app_Traccar>" \
     -d '{"to":"0397534239","message":"Test truc tiep gateway"}'
   ```
   Nếu cấu hình đúng và Gateway nhận lệnh OK, kết quả sẽ trả về `HTTP/1.1 200 OK`.

3. **Khởi động lại dịch vụ Backend:**
   ```bash
   sudo systemctl restart sms-backend.service
   ```

4. **Kiểm tra Health Check API:**
   ```bash
   curl http://127.0.0.1:8000/api/gateway/health
   ```
   Nếu trả về 200 OK, dịch vụ đã chạy bình thường. Cuối cùng, thực hiện test gửi SMS từ giao diện Frontend.

**Khuyến nghị giao diện & Vận hành:** 
- Frontend nên chỉ hiển thị trạng thái là **"Gateway đã nhận"** thay vì "Đã gửi thành công" để phản ánh chính xác trạng thái kỹ thuật (không có API Callback từ SMS Manager của Android để xác nhận 100% đến máy đích).
- Điện thoại làm Gateway cần phải luôn được cấu hình ổn định: cấp quyền `SEND_SMS`, tắt tối ưu hóa pin, SIM có đủ tiền/gói cước, và cấu hình Rate Limit phù hợp để không bị nhà mạng khóa SIM do nghi ngờ spam.

---

## 16. API Endpoints

| Method | Endpoint | Auth | Mo ta |
|--------|----------|------|-------|
| `POST` | `/api/gateway/send-sms` | JWT | Gui SMS (frontend, co idempotency) |
| `POST` | `/api/gateway/send-sms-external` | API Key | Gui SMS (external, co idempotency) |
| `GET` | `/api/gateway/logs` | JWT | Danh sach log (filter, pagination) |
| `GET` | `/api/gateway/logs/{id}` | JWT | Chi tiet ban ghi SMS |
| `POST` | `/api/gateway/logs/{id}/retry` | JWT (admin) | Gui lai SMS failed |
| `POST` | `/api/gateway/logs/{id}/cancel` | JWT (admin) | Huy SMS pending/queued |
| `GET` | `/api/gateway/health` | None | Health check backend |
| `GET` | `/api/gateway/device-health` | JWT | Kiem tra ket noi Android |
| `GET` | `/api/gateway/devices` | JWT (admin) | Danh sach thiet bi |
| `POST` | `/api/gateway/devices` | JWT (admin) | Them thiet bi |
| `PUT` | `/api/gateway/devices/{id}` | JWT (admin) | Sua thiet bi |
| `GET` | `/api/gateway/settings` | JWT | Xem cau hinh gateway |
| `POST` | `/api/gateway/settings` | JWT (admin) | Cap nhat cau hinh |

---

## 17. Nâng cao kiến trúc: Quản lý đa thiết bị Gateway

Để tránh lỗi cấu hình cứng trong `.env` và hỗ trợ mở rộng quy mô (SIM Farm, nhiều điện thoại), hệ thống cần chuyển sang **Kiến trúc quản lý thiết bị hoàn toàn qua Database** (`gateway_devices`). Khi đó, `.env` chỉ lưu cấu hình cốt lõi của ứng dụng (VD: `SECRET_KEY`, `DATABASE_URL`), còn thông tin kết nối Gateway cụ thể nằm ở bảng `gateway_devices`.

### 17.1. Cấu trúc bảng `gateway_devices`

Bảng `gateway_devices` lưu trữ đầy đủ:

- `id`: Mã thiết bị
- `name`: Tên thiết bị, ví dụ Phone 1, Samsung Vina
- `provider`: Nhà mạng SIM, ví dụ Viettel, MobiFone, VinaPhone
- `gateway_url`: URL Android Gateway, ví dụ `http://100.120.152.19:8082/`
- `api_key`: API key riêng của thiết bị Traccar
- `status`: `online`, `offline`, `unauthorized`, `error`
- `is_active`: bật/tắt thiết bị
- `is_default`: thiết bị mặc định nếu request không chỉ định `device_id`
- `daily_limit`: giới hạn gửi mỗi ngày
- `sent_today`: số tin đã gửi trong ngày
- `last_health_check`: thời điểm kiểm tra gần nhất
- `last_error`: lỗi gần nhất nếu có

*Lưu ý:* `api_key` không nên hiển thị đầy đủ trên giao diện. UI chỉ nên che đi, ví dụ: `044d****1d03`.

### 17.2. Bổ sung bảng `gateway_sms_logs`

Bảng `gateway_sms_logs` nên có thêm:
- `device_id`
- `gateway_url`
- `gateway_response`
- `error_message`
- `status`
- `retry_count`

Như vậy mỗi tin nhắn đều truy vết được rõ ràng: Tin này gửi qua thiết bị nào, Gateway URL nào, Traccar trả về gì, có lỗi 401, timeout, offline hay không.

Ví dụ log chuẩn:
```yaml
phone_number: 0397534239
device_id: phone_1
status: gateway_accepted
gateway_url: http://100.120.152.19:8082/
error_message: null
```

### 17.3. Luồng xử lý đa thiết bị khi gửi SMS

Khi giao diện người dùng gửi danh sách SMS, xử lý backend theo luồng:
1. Nhận danh sách số điện thoại
2. Chuẩn hóa số điện thoại
3. Xác định thiết bị gửi
4. Lấy `gateway_url` + `api_key` từ `gateway_devices`
5. Gửi HTTP POST sang Traccar Gateway
6. Ghi log từng tin vào `gateway_sms_logs` (kèm `device_id`)
7. Frontend poll trạng thái từng log

**Thứ tự ưu tiên định tuyến thiết bị của hệ thống (Đã được triển khai ở Backend):**

Khi người dùng gửi tin nhắn (hoặc hệ thống tự động gửi), Backend sẽ chọn thiết bị gửi theo thứ tự ưu tiên giảm dần dưới đây:

1. **Ưu tiên 1 - Lựa chọn thủ công (`manual`)**: Nếu giao dịch gửi chỉ định rõ mã thiết bị (`device_id`), hệ thống sẽ bỏ qua mọi quy tắc tự động và dùng đúng thiết bị được yêu cầu.
2. **Ưu tiên 2 - Khớp thiết bị cùng mạng di động (`carrier_match`)**: Hệ thống tự động phân tích đầu số điện thoại để nhận diện nhà mạng (Ví dụ: `Viettel`, `VinaPhone`, `MobiFone`). Nếu có thiết bị đang hoạt động (`is_active = True`) được cấu hình khớp với nhà mạng di động này, hệ thống sẽ sử dụng thiết bị đó để gửi nhằm tối ưu cước và tỷ lệ nhận tin.
3. **Ưu tiên 3 - Thiết bị mặc định (`default`)**: Nếu **không tìm thấy** thiết bị nào cùng mạng di động đang hoạt động (hoặc số điện thoại là mạng nước ngoài/lạ), hệ thống sẽ tự động chuyển sang sử dụng thiết bị được đánh dấu làm mặc định (`is_default = True`).
4. **Ưu tiên 4 - Thiết bị ngẫu nhiên bất kỳ (`any_online`)**: Nếu không có thiết bị mặc định được cấu hình, hệ thống sẽ lấy thiết bị đầu tiên đang hoạt động (`is_active = True`) trong danh sách cơ sở dữ liệu.
5. **Cấu hình fallback từ file môi trường (`env_fallback`)**: Nếu cơ sở dữ liệu hoàn toàn trống, hệ thống sẽ lấy cấu hình Gateway mặc định lưu trong tệp tin cấu hình hệ thống `.env` (`ANDROID_SMS_API_URL`).

### 17.4. Trạng thái & Kiểm tra sức khỏe (Health Check)

Trang Admin (Thiết bị) nên có các nút: **Kiểm tra kết nối**, **Gửi tin test**, **Bật / Tắt**, **Đặt mặc định**, **Xem log thiết bị**.

Backend cần phân loại lỗi rõ ràng:
- `online`: Gateway trả HTTP 200.
- `unauthorized`: Gateway trả HTTP 401 (sai hoặc thiếu `api_key`).
- `offline`: Timeout, không kết nối được IP/Port.
- `error`: Gateway trả 5xx hoặc lỗi khác.

Ví dụ lệnh Test trực tiếp:
```bash
curl -v -X POST "http://100.120.152.19:8082/" \
  -H "Content-Type: application/json" \
  -H "Authorization: API_KEY_CUA_THIET_BI" \
  -d '{"to":"0397534239","message":"Test gateway"}'
```

### 17.5. Chuyển đổi dự phòng (Failover) và chống gửi trùng lặp

Failover là cần thiết nhưng phải làm cẩn thận để tránh gửi trùng:
*(Ví dụ: Gateway A thực tế đã nhận lệnh gửi SMS đi, nhưng response HTTP bị timeout trả về Backend. Backend tưởng lỗi nên gửi lại qua Gateway B -> Người dùng nhận 2 tin).*

**Quy tắc an toàn:**
- Nếu lỗi `401 Unauthorized` → Không retry qua thiết bị đó, báo lỗi unauthorized.
- Nếu `Offline/Timeout` → Có thể retry có giới hạn (cần dùng `request_id` hoặc idempotency_key).
- Nếu đã `gateway_accepted` → Không tự gửi lại nữa.
- Nếu retry sang thiết bị khác → Ghi rõ `previous_device_id` và `retry_reason` vào log.

### 17.6. Vai trò của `.env`

Sau khi chuyển sang multi-device, `.env` **CHỈ** cần giữ:
```env
SECRET_KEY=...
DATABASE_URL=...
JWT_EXPIRE_MINUTES=...
```

**Không** dùng `.env` để lưu:
```env
ANDROID_SMS_API_URL=...
ANDROID_SMS_API_KEY=...
```
*(Tuy nhiên, có thể giữ các biến này làm fallback tạm thời trong giai đoạn chuyển đổi, nếu database chưa có thiết bị nào. Sau khi hệ thống ổn định, nên bỏ fallback để tránh nhầm lẫn).*

---

### Kết luận triển khai (Kế hoạch nâng cấp)

Phần này sẽ được đưa vào lộ trình nâng cấp với các bước:
- **Bước 1:** Cập nhật bảng `gateway_devices` để có đầy đủ `gateway_url` + `api_key`.
- **Bước 2:** Bổ sung `device_id` vào `gateway_sms_logs`.
- **Bước 3:** Sửa service gửi SMS để lấy cấu hình kết nối trực tiếp từ `device_id` hoặc thiết bị mặc định trong database.
- **Bước 4:** Thêm UI quản lý thiết bị, che API key, test connection, gửi SMS test, set default.

*Ưu tiên:* Đảm bảo log ghi nhận rõ `device_id` và UI báo lỗi minh bạch (`unauthorized`/`offline`), từ đó loại bỏ hoàn toàn các lỗi sập hệ thống do thiếu `ANDROID_SMS_API_KEY` trong `.env`.
