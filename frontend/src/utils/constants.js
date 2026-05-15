/**
 * SMS Status Labels
 * ─────────────────
 * Shared constants for displaying SMS status throughout the application.
 * Used in toast messages, log tables, progress tracking, and detail modals.
 *
 * Status flow:
 *   accepted → pending → queued → sending → gateway_accepted/sent/failed/retrying/cancelled
 *
 * IMPORTANT:
 *   - "accepted" means the backend has received the request and created a log entry.
 *     It does NOT mean the SMS was delivered.
 *   - "gateway_accepted" means the Android Gateway app received the HTTP request (200 OK).
 *     It does NOT guarantee the carrier delivered the SMS.
 *   - Only "sent" should be treated as successfully delivered (as far as the system knows).
 */

export const SMS_STATUS_LABELS = {
  accepted: 'Đã tiếp nhận',
  pending: 'Đang chờ gửi',
  queued: 'Đang xếp hàng',
  sending: 'Đang gửi',
  retrying: 'Đang thử lại',
  gateway_accepted: 'Gateway đã nhận',
  sent: 'Đã gửi',
  failed: 'Gửi thất bại',
  cancelled: 'Đã hủy',
  already_exists: 'Đã tồn tại',
};

/**
 * Get the Vietnamese label for a given SMS status.
 * Falls back to the raw status string if unknown.
 */
export function getStatusLabel(status) {
  return SMS_STATUS_LABELS[status] || status;
}

/**
 * Terminal statuses — polling should stop when one of these is reached.
 */
export const TERMINAL_STATUSES = new Set([
  'sent',
  'gateway_accepted',
  'failed',
  'cancelled',
]);

/**
 * Statuses considered "successful" for counting purposes.
 */
export const SUCCESS_STATUSES = new Set([
  'sent',
  'gateway_accepted',
]);

/**
 * Statuses considered "failed" for counting purposes.
 */
export const FAILED_STATUSES = new Set([
  'failed',
]);
