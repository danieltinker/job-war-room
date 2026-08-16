-- Comeet as a first-class ATS type. IF NOT EXISTS because some databases
-- already carry these values from earlier local experimentation.
ALTER TYPE "AtsType" ADD VALUE IF NOT EXISTS 'COMEET';
ALTER TYPE "JobSource" ADD VALUE IF NOT EXISTS 'COMEET';
