#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="sms-gateway.service"
ENV_FILE="/var/www/sms-gateway/backend/.env.production"
DEFAULT_DB="/var/www/sms-gateway/backend/sms_auto.db"
WORKDIR="/var/www/sms-gateway/backend"

echo "--- VPS Health Check: $(date -u) ---"

echo "\n1) Systemd unit file (${SERVICE_NAME}):"
if [ -f "/etc/systemd/system/${SERVICE_NAME}" ]; then
  sudo cat "/etc/systemd/system/${SERVICE_NAME}"
else
  sudo systemctl cat "${SERVICE_NAME}" || echo "Unit file not found via systemctl"
fi

echo "\n2) Environment file (${ENV_FILE}):"
if [ -f "${ENV_FILE}" ]; then
  sudo sed -n '1,200p' "${ENV_FILE}"
else
  echo "${ENV_FILE} not found"
fi

# Try to extract ANDROID SMS URL from env file or from /proc if service exported
ANDROID_URL=""
if [ -f "${ENV_FILE}" ]; then
  ANDROID_URL=$(sudo grep -E '^ANDROID_SMS_API_URL=' "${ENV_FILE}" | sed -E 's/^ANDROID_SMS_API_URL=//; s/^\"|\"$//') || true
fi
if [ -z "${ANDROID_URL}" ]; then
  ANDROID_URL=$(printenv ANDROID_SMS_API_URL || true)
fi

echo "\nDetected ANDROID_SMS_API_URL: ${ANDROID_URL:-<not-set>}"

echo "\n3) Recent journal logs for ${SERVICE_NAME} (last 200 lines):"
sudo journalctl -u "${SERVICE_NAME}" -n 200 --no-pager || true

echo "\n4) Look for worker / dispatch messages in logs:"
sudo journalctl -u "${SERVICE_NAME}" -n 500 --no-pager | grep -E "Pending SMS worker started|Worker picking up SMS|Sending payload|Error sending to" -n || echo "No worker keywords found in recent logs"

# Connectivity tests
if [ -n "${ANDROID_URL}" ]; then
  echo "\n5) Connectivity tests to ANDROID_SMS_API_URL: ${ANDROID_URL}"
  # strip trailing slash
  url=${ANDROID_URL%/}
  echo "-- curl (GET) --"
  sudo curl -v --max-time 5 "${url}" || true
  echo "\n-- curl /health (GET) if exists --"
  sudo curl -v --max-time 5 "${url}/health" || true
  # extract host and port for nc
  host=$(echo "${url}" | sed -E 's|https?://||' | cut -d/ -f1)
  host_only=$(echo "$host" | cut -d: -f1)
  port=$(echo "$host" | grep ':' | cut -d: -f2 || echo "8082")
  echo "\n-- nc test ${host_only} ${port} --"
  sudo nc -vz "${host_only}" "${port}" || echo "nc failed or unavailable"
else
  echo "\n5) ANDROID_SMS_API_URL not set; skipping connectivity tests"
fi

# DB checks
DB_PATH="${DEFAULT_DB}"
if [ -f "${WORKDIR}/sms_auto.db" ]; then
  DB_PATH="${WORKDIR}/sms_auto.db"
fi

echo "\n6) Database file: ${DB_PATH}"
if [ -f "${DB_PATH}" ]; then
  ls -l "${DB_PATH}"
  echo "\n-- Recent gateway_sms_logs --"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${DB_PATH}" "SELECT id,status,retry_count,error_message,gateway_response,gateway_url,next_retry_at,created_at FROM gateway_sms_logs ORDER BY created_at DESC LIMIT 20;"
  else
    echo "sqlite3 not installed on VPS. Install with: sudo apt-get install -y sqlite3"
  fi
else
  echo "Database file not found at ${DB_PATH}"
fi

echo "\n7) gateway_devices and settings (if DB available):"
if [ -f "${DB_PATH}" ] && command -v sqlite3 >/dev/null 2>&1; then
  echo "-- gateway_devices --"
  sqlite3 "${DB_PATH}" "SELECT id,name,base_url,api_key,is_active,status,last_error FROM gateway_devices;"
  echo "\n-- settings (android keys) --"
  sqlite3 "${DB_PATH}" "SELECT key,value FROM settings WHERE key LIKE 'android%';"
fi

echo "\n8) File permissions for working dir and DB:"
sudo ls -ld "${WORKDIR}" || true
sudo ls -l "${DB_PATH}" || true

echo "\n--- End of checks ---"
