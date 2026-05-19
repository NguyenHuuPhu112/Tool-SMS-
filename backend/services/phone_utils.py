import re

# Basic VN mobile prefix mapping (common prefixes)
_VIETTEL = {"086","096","097","098","032","033","034","035","036","037","038","039"}
_MOBIFONE = {"070","079","077","076","078","089","090","093"}
_VINAPHONE = {"081","082","083","084","085","088","091","094"}


def normalize_vn_phone(phone: str) -> str:
    """Normalize phone numbers to local VN format starting with 0.

    Examples:
      +84901234567 -> 0901234567
      84901234567 -> 0901234567
      0901234567 -> 0901234567
    """
    if not phone:
        return phone
    s = re.sub(r"[^0-9+]", "", phone.strip())
    # +84 international prefix
    if s.startswith("+84"):
        s = "0" + s[3:]
    elif s.startswith("84") and len(s) > 2:
        s = "0" + s[2:]
    # if starts with multiple 0s, collapse
    s = re.sub(r"^0+", "0", s)
    return s


def detect_vn_carrier(phone: str) -> str | None:
    """Detect common Vietnamese carrier by prefix. Returns 'viettel','mobifone','vinaphone' or 'unknown'."""
    if not phone:
        return None
    s = re.sub(r"[^0-9]", "", phone)
    # ensure starts with 0
    if s.startswith("+84"):
        s = "0" + s[3:]
    if s.startswith("84"):
        s = "0" + s[2:]
    if not s or len(s) < 3:
        return "unknown"
    prefix3 = s[:3]
    if prefix3 in _VIETTEL:
        return "viettel"
    if prefix3 in _MOBIFONE:
        return "mobifone"
    if prefix3 in _VINAPHONE:
        return "vinaphone"
    return "unknown"
