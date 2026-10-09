'use strict';

const STEPS = ['basics', 'details', 'categories', 'services', 'portfolio', 'booking', 'extras', 'review'];
const PROFILE_FIELDS = {
  basics: ['business_name', 'professional_handle', 'workplace_name', 'street_address', 'suite', 'city', 'state', 'zip_code'],
  details: ['bio', 'price_min', 'price_max', 'years_experience'],
  booking: ['booking_url'],
  license: ['license_number', 'license_state'],
};

function mergeSetupProfile(profile, body) {
  const fields = PROFILE_FIELDS[body._setup_step];
  if (!fields) return body;
  // Only this screen's fields may change. Other profile values come from the database.
  const merged = { ...profile, _setup_step: body._setup_step, _setup_exit: body._setup_exit, _csrf: body._csrf };
  for (const field of fields) merged[field] = String(body[field] == null ? '' : body[field]).slice(0, 3000);
  return merged;
}

function setupDestination(step, exit, error) {
  if (!STEPS.includes(step) && step !== 'license') return null;
  if (error) return '/dashboard/pro/onboarding?step=' + (step === 'license' ? 'extras' : step);
  if (exit === '1') return '/dashboard/pro?setup=saved';
  const next = step === 'license' ? 'extras' : STEPS[Math.min(STEPS.indexOf(step) + 1, STEPS.length - 1)];
  return '/dashboard/pro/onboarding?step=' + next;
}

module.exports = { STEPS, PROFILE_FIELDS, mergeSetupProfile, setupDestination };
