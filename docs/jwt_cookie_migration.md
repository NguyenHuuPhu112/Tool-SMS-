# Migration Guide: JWT from localStorage to HttpOnly Cookies

This document outlines required changes to move JWT storage from `localStorage` to HttpOnly cookies.

1. Backend changes
- On login, set `Set-Cookie` header with the refresh token and/or access token using `HttpOnly`, `Secure`, and appropriate `SameSite` (Lax or Strict) flags.
- Example (FastAPI):

```py
from fastapi import Response
response.set_cookie(
    key="refresh_token",
    value=refresh_token,
    httponly=True,
    secure=True,
    samesite="Lax",
    max_age=30*24*3600,
)
```

- For access tokens, you can either return them in response body (short-lived) or also store them in HttpOnly cookie.
- Enable CORS with `allow_credentials=True` and list exact allowed origins.
- Consider CSRF protection if storing auth tokens in cookies (CSRF tokens or SameSite=strict).

2. Frontend changes
- Remove use of `localStorage` for tokens.
- Use `fetch`/`axios` with `{ withCredentials: true }` to send cookies.
- Use a dedicated endpoint to refresh access token (`/api/auth/refresh`) which will read HttpOnly refresh cookie and respond with a new access token (or set a new access cookie).

3. Security considerations
- HttpOnly + Secure cookies mitigate XSS token theft but require CSRF mitigations.
- Use short-lived access tokens and long-lived refresh tokens in HttpOnly cookies.
- Implement server-side refresh token revocation (DB) if needed.

4. Rollout strategy
- Phase 1: Add cookie-based refresh tokens while still supporting bearer tokens for clients during transition.
- Phase 2: Update frontend to use cookies and withCredentials. Monitor for issues.
- Phase 3: Deprecate bearer-in-body storage and remove localStorage usage.

5. Testing checklist
- Verify cookies are set with `HttpOnly` and `Secure` flags.
- Verify CORS `Access-Control-Allow-Credentials` and `Access-Control-Allow-Origin` are correct.
- Verify CSRF protections (token or SameSite) are in place.

This migration improves protection against XSS but requires careful handling of CSRF and CORS.