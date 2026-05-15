import os, requests, json
BASE='http://127.0.0.1:8000'
# creds
username='admin'
password='admin123'
# device data
device_payload={
    'name':'Farm Device 100.120.152.19',
    'base_url':'http://100.120.152.19:8082/',
    'api_key':'044d1598-d11d-4c1f-a134-0b3b49ab1d03',
    'is_active':True
}
# login
r = requests.post(f'{BASE}/api/auth/login', data={'username':username,'password':password})
print('login status', r.status_code)
print(r.text)
if r.status_code!=200:
    raise SystemExit('Login failed')
access = r.json().get('access_token')
print('got token len', len(access))
headers = {'Authorization':f'Bearer {access}','Content-Type':'application/json'}
resp = requests.post(f'{BASE}/api/gateway/devices', headers=headers, json=device_payload)
print('create device status', resp.status_code)
try:
    print(json.dumps(resp.json(), ensure_ascii=False, indent=2))
except Exception:
    print(resp.text)
