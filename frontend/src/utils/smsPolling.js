/**
 * SMS Status Polling Utility
 * ──────────────────────────
 * Polls the backend SMS log endpoint to determine the real delivery status.
 *
 * Usage:
 *   const finalStatus = await pollSmsStatus(logId, { onStatusChange });
 *
 * The poller will:
 *   1. Wait `interval` ms between each check (default 2000ms)
 *   2. GET /api/gateway/logs/{logId}
 *   3. If the status is terminal (sent, gateway_accepted, failed, cancelled), resolve
 *   4. If maxAttempts is reached without a terminal status, resolve with the last status
 *
 * Returns: { status, error_message, log } — the final poll result.
 */

import axios from 'axios';
import { TERMINAL_STATUSES } from './smsStatus';

const API_BASE = '/api/gateway';

/**
 * Poll the status of a single SMS log until it reaches a terminal state.
 *
 * @param {string} logId - The SMS log ID to poll
 * @param {Object} options
 * @param {number} options.maxAttempts - Maximum number of poll attempts (default 10)
 * @param {number} options.interval - Milliseconds between polls (default 2000)
 * @param {function} options.onStatusChange - Callback when status changes: (status, log) => void
 * @param {AbortSignal} options.signal - Optional AbortSignal to cancel polling
 * @returns {Promise<{status: string, error_message: string|null, log: object, timedOut: boolean}>}
 */
export async function pollSmsStatus(logId, options = {}) {
  const {
    maxAttempts = 30, // Increased default
    initialInterval = 2000,
    onStatusChange = null,
    signal = null,
  } = options;

  let lastStatus = 'accepted';
  let lastLog = null;
  let currentInterval = initialInterval;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check if polling was cancelled
    if (signal?.aborted) {
      console.log(`[SMS Poll] Polling cancelled for log ${logId}`);
      return { status: lastStatus, error_message: null, log: lastLog, timedOut: false };
    }

    // Wait before polling
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, currentInterval);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          resolve(); // Resolve instead of reject to handle gracefully
        }, { once: true });
      }
    });

    // Check again after waiting
    if (signal?.aborted) {
      return { status: lastStatus, error_message: null, log: lastLog, timedOut: false };
    }

    try {
      const res = await axios.get(`${API_BASE}/logs/${logId}`);
      const log = res.data;
      lastLog = log;

      console.log(
        `[SMS Poll] Log ${logId} attempt ${attempt}/${maxAttempts}: status=${log.status}`
      );

      // Notify status change
      if (log.status !== lastStatus && onStatusChange) {
        onStatusChange(log.status, log);
      }
      lastStatus = log.status;

      // Check if terminal
      if (TERMINAL_STATUSES.has(log.status)) {
        console.log(`[SMS Poll] Log ${logId} reached terminal status: ${log.status}`);
        return {
          status: log.status,
          error_message: log.error_message || null,
          log,
          timedOut: false,
        };
      }

      // Adjust interval based on current status
      if (log.status === 'gateway_accepted' || log.status === 'sent') {
        currentInterval = 5000; // Poll slower when waiting for delivery callbacks
      } else {
        currentInterval = initialInterval; // Poll fast for pending/sending
      }

    } catch (err) {
      console.error(`[SMS Poll] Error polling log ${logId} (attempt ${attempt}):`, err.message);
      // Continue polling on error — the log might not be ready yet
    }
  }

  // Max attempts reached without terminal status
  console.warn(
    `[SMS Poll] Log ${logId} did not reach terminal status after ${maxAttempts} attempts. Last status: ${lastStatus}`
  );

  return {
    status: lastStatus,
    error_message: null,
    log: lastLog,
    timedOut: true,
  };
}

/**
 * Poll multiple SMS logs in parallel.
 *
 * @param {string[]} logIds - Array of SMS log IDs to poll
 * @param {Object} options - Same options as pollSmsStatus, plus:
 * @param {function} options.onItemComplete - Callback when one item finishes: (logId, result) => void
 * @returns {Promise<Map<string, {status, error_message, log, timedOut}>>}
 */
export async function pollMultipleSmsStatus(logIds, options = {}) {
  const { onItemComplete, ...pollOptions } = options;

  const results = new Map();

  const promises = logIds.map(async (logId) => {
    const result = await pollSmsStatus(logId, pollOptions);
    results.set(logId, result);
    if (onItemComplete) {
      onItemComplete(logId, result);
    }
    return result;
  });

  await Promise.allSettled(promises);
  return results;
}
