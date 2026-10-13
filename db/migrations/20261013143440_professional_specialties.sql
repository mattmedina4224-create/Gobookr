CREATE TABLE IF NOT EXISTS pro_specialties (
  pro_id BIGINT NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL CHECK(specialty IN ('black-gray-realism','fine-line','traditional-tattoos','color-realism','razor-fade','skin-fade','beard-shaping','balayage','curly-hair','hair-extensions','blonding','color-correction','natural-hair','braids','russian-manicure','gel-nails','nail-art','acrylic-nails','lash-extensions','lash-lift','brow-lamination','brow-shaping','brazilian-wax','sugaring','deep-tissue','sports-massage','prenatal-massage','bridal-makeup','bridal-hair')),
  PRIMARY KEY (pro_id, specialty)
);
CREATE INDEX IF NOT EXISTS pro_specialties_specialty_pro_idx ON pro_specialties(specialty,pro_id);
ALTER TABLE pro_specialties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pro_specialties FROM PUBLIC, anon, authenticated, service_role;
