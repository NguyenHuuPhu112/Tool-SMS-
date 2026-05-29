import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

load_dotenv()

def get_smtp_config():
    return {
        "host": os.getenv("EMAIL_SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.getenv("EMAIL_SMTP_PORT", 587)),
        "user": os.getenv("EMAIL_SMTP_USER", ""),
        "password": os.getenv("EMAIL_SMTP_PASSWORD", ""),
        "from_name": os.getenv("EMAIL_FROM_NAME", "SMS Gateway"),
        "from_address": os.getenv("EMAIL_FROM_ADDRESS", "")
    }

def send_email(to_email: str, subject: str, html_body: str, text_body: str = None):
    config = get_smtp_config()
    
    if not config["user"] or not config["password"]:
        raise Exception("SMTP configuration is incomplete. Please check .env file.")

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f"{config['from_name']} <{config['from_address']}>"
    msg['To'] = to_email

    if text_body:
        msg.set_content(text_body)
        msg.add_alternative(html_body, subtype='html')
    else:
        msg.set_content(html_body, subtype='html')

    try:
        with smtplib.SMTP(config["host"], config["port"]) as server:
            server.starttls()
            server.login(config["user"], config["password"])
            server.send_message(msg)
    except Exception as e:
        # Avoid logging the password, just raise a generic connection error if needed or log safely
        raise Exception(f"Failed to send email: {str(e)}")

def send_otp_email(to_email: str, otp_code: str, expire_minutes: int = 10, purpose: str = "register"):
    subject = "Mã xác thực đăng ký tài khoản SMS Gateway"
    
    if purpose == "reset_password":
        subject = "Mã xác thực khôi phục mật khẩu SMS Gateway"
        
    text_body = f"""Xin chào,
Mã xác thực của bạn là: {otp_code}
Mã có hiệu lực trong {expire_minutes} phút.
Nếu bạn không yêu cầu đăng ký, vui lòng bỏ qua email này.
"""
    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333;">Xác thực tài khoản</h2>
        <p>Xin chào,</p>
        <p>Mã xác thực của bạn là:</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; text-align: center; margin: 20px 0;">
            <h1 style="margin: 0; color: #007bff; letter-spacing: 5px;">{otp_code}</h1>
        </div>
        <p>Mã có hiệu lực trong <strong>{expire_minutes} phút</strong>.</p>
        <p style="color: #666; font-size: 14px;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">Hệ thống SMS Gateway</p>
    </div>
    """
    
    send_email(to_email, subject, html_body, text_body)
