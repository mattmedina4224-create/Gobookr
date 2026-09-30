'use strict';

const PROFESSIONAL_CATEGORIES = [
  { value: 'barber', label: 'Barber', plural: 'Barbers', kind: 'profession' },
  { value: 'stylist', label: 'Hairstylist', plural: 'Hairstylists', kind: 'profession' },
  { value: 'colorist', label: 'Colorist', plural: 'Colorists', kind: 'profession' },
  { value: 'nail_technician', label: 'Nail Technician', plural: 'Nail Technicians', kind: 'profession' },
  { value: 'eyelash_technician', label: 'Eyelash Technician', plural: 'Eyelash Technicians', kind: 'profession' },
  { value: 'eyebrow_technician', label: 'Eyebrow Technician', plural: 'Eyebrow Technicians', kind: 'profession' },
  { value: 'waxing_specialist', label: 'Waxing Specialist', plural: 'Waxing Specialists', kind: 'profession' },
  { value: 'tattoo_artist', label: 'Tattoo Artist', plural: 'Tattoo Artists', kind: 'profession' },
  { value: 'massage_therapist', label: 'Massage Therapist', plural: 'Massage Therapists', kind: 'profession' },
  { value: 'makeup_artist', label: 'Makeup Artist', plural: 'Makeup Artists', kind: 'specialty' },
  { value: 'wedding_services', label: 'Weddings', plural: 'Weddings', kind: 'specialty' },
];

const PROFESSIONAL_CATEGORY_VALUES = new Set(PROFESSIONAL_CATEGORIES.map((item) => item.value));
const LEGACY_PROFILE_CATEGORIES = new Set(['barber', 'stylist', 'colorist']);

function categoryLabel(value) {
  const item = PROFESSIONAL_CATEGORIES.find((category) => category.value === value);
  return item ? item.label : 'Professional';
}

function categoryPlural(value) {
  const item = PROFESSIONAL_CATEGORIES.find((category) => category.value === value);
  return item ? item.plural : 'Professionals';
}

module.exports = {
  PROFESSIONAL_CATEGORIES,
  PROFESSIONAL_CATEGORY_VALUES,
  LEGACY_PROFILE_CATEGORIES,
  categoryLabel,
  categoryPlural,
};
