ALTER TABLE public.pro_categories
DROP CONSTRAINT IF EXISTS pro_categories_category_check;
ALTER TABLE public.pro_categories
ADD CONSTRAINT pro_categories_category_check CHECK (
  category = ANY (ARRAY[
    'barber','stylist','colorist','nail_technician',
    'eyelash_technician','eyebrow_technician','waxing_specialist',
    'tattoo_artist','massage_therapist','makeup_artist',
    'esthetician','permanent_makeup_artist','threading_specialist',
    'wedding_services','spray_tan_specialist'
  ])
);
