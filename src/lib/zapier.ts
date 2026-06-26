/**
 * Zapier Integration Helper
 * Stores/retrieves integration health status in-memory.
 */

declare global {
  var _zapierLastDeliveryStatus: 'success' | 'failed' | 'unknown' | undefined;
}

export function getLastDeliveryStatus(): 'success' | 'failed' | 'unknown' {
  if (global._zapierLastDeliveryStatus === undefined) {
    global._zapierLastDeliveryStatus = 'unknown';
  }
  return global._zapierLastDeliveryStatus;
}

export function setLastDeliveryStatus(status: 'success' | 'failed' | 'unknown') {
  global._zapierLastDeliveryStatus = status;
}
