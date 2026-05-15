from models.database import SessionLocal, GatewayDevice

db = SessionLocal()
try:
    devices = db.query(GatewayDevice).all()
    for d in devices:
        print(d.id, d.name, d.base_url, d.api_key, d.is_active, d.status)
finally:
    db.close()
