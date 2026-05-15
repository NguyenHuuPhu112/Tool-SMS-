import sqlite3
import uuid
import datetime

conn = sqlite3.connect('sms_auto.db')
c = conn.cursor()

token = '044d1598-d11d-4c1f-a134-0b3b49ab1d03'
endpoints = [
    ('Sim Farm (Local)', 'http://192.168.1.29:8082'),
    ('Sim Farm (Public 1)', 'http://214.138.115.94:8082'),
    ('Sim Farm (Public 2)', 'http://53.195.209.236:8082')
]

for name, url in endpoints:
    c.execute(
        "INSERT INTO gateway_devices (id, name, base_url, api_key, is_active, status, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), name, url, token, True, 'online', datetime.datetime.utcnow(), datetime.datetime.utcnow())
    )

conn.commit()
conn.close()
print("Thêm thiết bị thành công!")
