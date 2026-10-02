-- Expand the existing category allowlist; preserve every row and relationship.
BEGIN;
ALTER TABLE public.pro_categories DROP CONSTRAINT IF EXISTS pro_categories_category_check;
ALTER TABLE public.pro_categories ADD CONSTRAINT pro_categories_category_check CHECK (category IN (
  'barber','stylist','colorist','nail_technician','eyelash_technician',
  'eyebrow_technician','waxing_specialist','tattoo_artist','massage_therapist',
  'makeup_artist','wedding_services'
));
COMMIT;
