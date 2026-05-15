import os
import requests
import time
from sqlalchemy.orm import Session
from models.database import Setting

def get_esms_credentials(db: Session):
    settings = db.query(Setting).all()
    settings_dict = {s.key: s.value for s in settings}
    return {
        "api_key": settings_dict.get("esms_api_key", "").strip(),
        "secret_key": settings_dict.get("esms_secret_key", "").strip(),
        "brandname": settings_dict.get("esms_brandname", "").strip(),
        "sms_type": settings_dict.get("esms_sms_type", "4").strip(),
    }

def send_esms_sms(to_phone: str, body: str, db: Session):
    """
    Gửi tin nhắn qua eSMS.vn API
    Trả về bộ tuple: (is_success, error_message)
    """
    try:
        creds = get_esms_credentials(db)
        if not creds["api_key"] or not creds["secret_key"]:
            time.sleep(0.5)
            raise Exception("eSMS Credentials missing. Configure in Settings.")

        url = "https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/"
        sms_type = creds["sms_type"]
        
        # SmsType 2 (CSKH Brandname): Bắt buộc IsUnicode=0, nội dung phải khớp template đã đăng ký
        # SmsType 8 (Đầu số cố định): Không hỗ trợ Brandname
        if sms_type == "2":
            is_unicode = "0"
            brandname = creds["brandname"]
        elif sms_type == "8":
            is_unicode = "1" if any(ord(c) > 127 for c in body) else "0"
            brandname = ""
        else:
            is_unicode = "1" if any(ord(c) > 127 for c in body) else "0"
            brandname = creds["brandname"]

        payload = {
            "ApiKey": creds["api_key"],
            "SecretKey": creds["secret_key"],
            "Phone": to_phone,
            "Content": body,
            "SmsType": sms_type,
            "IsUnicode": is_unicode,
            "Brandname": brandname,
        }
        
        response = requests.post(url, json=payload, timeout=10)
        data = response.json()
        
        if data.get("CodeResult") == "100":
            return (True, None)
        else:
            return (False, f"eSMS Error {data.get('CodeResult')}: {data.get('ErrorMessage', 'Unknown')}")
            
    except Exception as e:
        return (False, str(e))

def get_esms_balance(db: Session):
    try:
        creds = get_esms_credentials(db)
        if not creds["api_key"] or not creds["secret_key"]:
            return {"status": "error", "message": "Missing credentials"}
            
        url = f"http://rest.esms.vn/MainService.svc/json/GetBalance/{creds['api_key']}/{creds['secret_key']}"
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data.get("CodeResponse") == "100":
            return {"status": "success", "balance": data.get("Balance")}
        else:
            return {"status": "error", "message": f"eSMS Error {data.get('CodeResponse')}"}
            
    except Exception as e:
        return {"status": "error", "message": str(e)}
