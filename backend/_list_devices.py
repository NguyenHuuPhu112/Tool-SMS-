import os, requests, json
BASE='http://127.0.0.1:8000'
username='admin'; password='admin123'
r = requests.post(f'{BASE}/api/auth/login', data={'username':username,'password':password})
if r.status_code!=200:
    print('login failed', r.status_code, r.text); raise SystemExit()
access = r.json().get('access_token')
headers={'Authorization':f'Bearer {access}'}
resp = requests.get(f'{BASE}/api/gateway/devices', headers=headers)
print('STATUS', resp.status_code)
try:
    print(json.dumps(resp.json(), ensure_ascii=False, indent=2))
except Exception:
    print(resp.text)
