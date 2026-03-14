-- Fix DSP source to use correct Dataverse entity and logical name
UPDATE sources
SET entity_set_name = 'cr4fe_dspalls', logical_name = 'cr4fe_dspalls'
WHERE name ILIKE '%DSP%';
