# Security Test Plan

This file lists commands and steps to verify the security improvements made to the project.

1. Check SECRET_KEY presence

```bash
# from project root
python - <<'PY'
import os
print('SECRET_KEY=', os.getenv('SECRET_KEY'))
PY
```

2. Verify login rate limiter (manual)
- Start backend server:

```bash
cd backend
uvicorn main:app --reload
```

- Simulate failed logins (use `curl` or a small script) more than `LOGIN_MAX_FAILS` within 15 minutes from same IP and confirm you get HTTP 429.

3. Verify password policy
- Use admin endpoints to create a user with weak password and confirm API rejects it.

4. Verify token TTL and refresh
- Login and check returned `access_token` expires in ~`ACCESS_TOKEN_EXPIRE_MINUTES` minutes.
- Use `/api/auth/refresh` with the provided `refresh_token` to obtain a new access token.

5. Frontend 401 handling
- Start frontend and backend. Force token invalidation and confirm frontend intercepts 401, clears token and redirects to `/login`.

6. Optional: XSS / CSRF checks
- If migrating to cookies, run CSRF tests and verify `SameSite` and `HttpOnly` flags.

7. Automating tests
- Consider adding integration tests that can perform repeated login attempts to assert rate limiting.

Notes
- Some checks require server to be running and accessible. Run the server locally and follow commands above.
- Revocation of refresh tokens is not implemented in this change; consider adding DB-backed revocation if higher security is needed.
