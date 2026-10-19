'use strict';

const CAPABILITIES = Object.freeze({
  LIVE_BOOKING: 'live_booking',
  LIVE_AVAILABILITY: 'live_availability',
  EXTERNAL_BOOKING: 'external_booking',
});

function capabilityFor(pro) {
  if (pro && pro.booking_provider === 'square' && pro.booking_provider_connected) return CAPABILITIES.LIVE_BOOKING;
  if (pro && pro.booking_provider_live_availability) return CAPABILITIES.LIVE_AVAILABILITY;
  return CAPABILITIES.EXTERNAL_BOOKING;
}

function demoAvailability(pro, now = new Date()) {
  if (process.env.BOOKING_AVAILABILITY_DEMO !== '1') return [];
  // Preview-only UX fixture. These slots are intentionally labeled demo and
  // must never be represented as provider-backed availability.
  const seed = Number(pro && pro.id) || 1;
  const hours = [10, 11, 13, 14, 16, 17];
  return hours.slice(seed % 3, (seed % 3) + 3).map((hour, index) => {
    const at = new Date(now);
    at.setHours(hour, index === 1 ? 30 : 0, 0, 0);
    return { at, label: at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) };
  });
}

module.exports = { CAPABILITIES, capabilityFor, demoAvailability };
