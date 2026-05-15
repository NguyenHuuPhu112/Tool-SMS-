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

### Truong hop 1: FastAPI chay tren cung mang LAN

Khong can cau hinh them. Chi can su dung IP noi bo cua dien thoai.

```
ANDROID_SMS_API_URL=http://192.168.1.100:8080/v1/sms
```

### Truong hop 2: FastAPI chay tren Cloud/VPS (Khuyen nghi su dung Tailscale hoac ZeroTier)

De he thong hoat dong on dinh va bao mat khi backend nam tren Cloud/VPS, dien thoai Android nam sau NAT (mang gia dinh) thi **Tailscale** hoac **ZeroTier** la lua chon toi uu:

| Giai phap | Do kho | Bao mat | Ghi chu |
|-----------|--------|---------|---------|
| **Tailscale (Uu tien)** | De | Cao | De cai dat, quan ly truc quan, khuyen dung nhat |
| **ZeroTier (Du phong)** | De | Cao | Tao mang ao mien phi, tot neu da quen dashboard |
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
