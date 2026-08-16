-- Normalize rows that use enum values unknown to the application schema
-- (leftovers from local experimentation). Any such row makes Prisma fail to
-- deserialize entire result sets, crashing pages. Reset them to safe defaults;
-- the ::text comparison works no matter what values exist in the database.

UPDATE "Company" SET ats = 'NONE'
WHERE ats::text NOT IN ('NONE','GREENHOUSE','LEVER','ASHBY','SMARTRECRUITERS','COMEET');

UPDATE "Job" SET source = 'MANUAL'
WHERE source::text NOT IN ('LINKEDIN','GREENHOUSE','LEVER','ASHBY','SMARTRECRUITERS','COMEET','CAREERS','EMAIL','WHATSAPP','MANUAL');

UPDATE "Match" SET status = 'SUGGESTED'
WHERE status::text NOT IN ('SUGGESTED','DISMISSED','CONVERTED');

UPDATE "Application" SET status = 'APPLIED'
WHERE status::text NOT IN ('APPLIED','IN_REVIEW','ASSESSMENT','INTERVIEW','OFFER','REJECTED','WITHDRAWN','GHOSTED');

UPDATE "ApplicationEvent" SET source = 'SYSTEM'
WHERE source::text NOT IN ('MANUAL','EMAIL','SYSTEM');

UPDATE "EmailMessage" SET classification = 'OTHER'
WHERE classification::text NOT IN ('APPLICATION_RECEIVED','ASSESSMENT','INTERVIEW','OFFER','REJECTION','RECRUITER_OUTREACH','OTHER');

UPDATE "ScrapeRun" SET status = 'FAILED'
WHERE status::text NOT IN ('RUNNING','SUCCESS','FAILED');

UPDATE "SweepSource" SET status = 'FAILED'
WHERE status::text NOT IN ('OK','EMPTY','FAILED');
