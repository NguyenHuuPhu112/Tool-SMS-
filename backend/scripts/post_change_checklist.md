# Post-deployment Test Checklist

1) Run migration to add new columns:

```bash
python backend/scripts/migrate_add_gateway_log_fields.py
```

2) Verify columns exist:

```bash
sqlite3 sms_auto.db "PRAGMA table_info('gateway_sms_logs');"
```

3) Test normalized numbers and carrier detection:
- Send request with `039xxxx` (Viettel) → check `detected_provider` = `viettel` and routing_strategy `carrier_match` if a viettel device exists.
- Send request with `090xxxx` (Mobi) → `detected_provider` = `mobifone` and routed to mobifone device.
- Send request with unknown prefix → routed to default device or env fallback.

4) Test manual device selection:
- Send request with `device_id` in payload → must use that device and `routing_strategy` = `manual`.

5) Test unauthorized handling:
- Configure a device with wrong API key → when gateway returns 401, device.status must become `unauthorized` and log status `failed`.

6) Test timeout/offline handling:
- Point device to non-routable IP or shut down gateway → after Timeout/Connect error device.status must become `offline` and log retry behavior applies.

7) Ensure no duplicate sends after gateway_accepted:
- Simulate a gateway that returns 200 but delivery fails later; backend must not retry to another device after gateway_accepted.

8) Verify .env fallback:
- Remove/disable all DB devices and set `ANDROID_SMS_API_URL` in `.env` → requests should use env fallback and `routing_strategy` = `env_fallback`.

9) Check logs:
- Each `gateway_sms_logs` entry should contain `device_id`, `detected_provider`, `requested_provider`, and `routing_strategy`.

10) Smoke test existing endpoints to ensure no regressions:
- `/api/gateway/send-sms`
- `/api/gateway/send-sms-external`
- `/api/gateway/logs`


# Notes
- Do NOT remove or change existing send flow; changes were implemented to be additive and fallback-safe.
- Keep `.env` as temporary fallback until all devices are added to DB.
