/**
 * SMS Status Utility
 * ──────────────────
 * Helper functions and definitions for SMS log statuses.
 */

export const SMS_STATUS_LABELS = {
  accepted: 'Đã tiếp nhận',
  pending: 'Chờ xử lý',
  queued: 'Trong hàng đợi',
  sending: 'Đang gửi',
  gateway_accepted: 'Gateway đã nhận',
  sent: 'Đã gửi qua SIM',
  delivered: 'Đã giao đến người nhận',
  failed: 'Gửi thất bại',
  delivery_failed: 'Không giao được',
  retrying: 'Đang thử lại',
  cancelled: 'Đã hủy',
  already_exists: 'Đã tồn tại',
};

export const TERMINAL_STATUSES = new Set([
  'delivered',
  'failed',
  'delivery_failed',
  'cancelled',
]);

export const SUCCESS_STATUSES = new Set([
  'sent',
  'delivered',
  'gateway_accepted',
]);

export const FAILED_STATUSES = new Set([
  'failed',
  'delivery_failed',
]);

export function getSmsStatusLabel(status) {
  return SMS_STATUS_LABELS[status] || status;
}

export function getSmsStatusColor(status) {
  switch (status) {
    case 'delivered':
      return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'sent':
      return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'gateway_accepted':
      return 'text-indigo-700 bg-indigo-50 border-indigo-200';
    case 'failed':
    case 'delivery_failed':
      return 'text-red-700 bg-red-50 border-red-200';
    case 'retrying':
      return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    case 'pending':
    case 'queued':
      return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'cancelled':
      return 'text-gray-700 bg-gray-50 border-gray-200';
    default:
      return 'text-gray-700 bg-gray-50 border-gray-200';
  }
}

export function isSmsTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

export function getSmsStatusDescription(status) {
  switch (status) {
    case 'gateway_accepted':
      return 'Thiết bị Android Gateway đã nhận lệnh gửi. Trạng thái này chưa xác nhận 100% người nhận đã nhận SMS. Cần delivery callback từ Android Gateway để xác nhận sent/delivered.';
    case 'sent':
      return 'Tin nhắn đã được thiết bị/SIM gửi ra nhà mạng.';
    case 'delivered':
      return 'Tin nhắn đã được báo giao đến người nhận.';
    case 'failed':
      return 'Gửi thất bại. Vui lòng kiểm tra thiết bị, SIM, mạng hoặc API key.';
    case 'delivery_failed':
      return 'Tin nhắn đã gửi ra nhưng không giao được tới người nhận.';
    case 'pending':
    case 'queued':
      return 'Đang chờ hệ thống xử lý để gửi qua Android Gateway.';
    case 'sending':
      return 'Đang truyền lệnh gửi xuống thiết bị Android.';
    case 'retrying':
      return 'Gửi lỗi, hệ thống đang tự động thử lại.';
    case 'cancelled':
      return 'Tin nhắn đã bị hủy trước khi gửi.';
    default:
      return '';
  }
}
