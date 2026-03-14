-- Fix DSP source to use correct Dataverse entity and logical name
UPDATE sources
SET entity_set_name = 'cr4fe_dspall', logical_name = 'cr4fe_dspall'
WHERE name ILIKE '%DSP%' AND entity_set_name = 'cr4fe_dspalls';
