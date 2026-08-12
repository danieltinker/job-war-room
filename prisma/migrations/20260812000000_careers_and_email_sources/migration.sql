-- Company careers-page scraping + jobs sourced from careers pages / emails
ALTER TABLE "Company" ADD COLUMN "careersUrl" TEXT NOT NULL DEFAULT '';

ALTER TYPE "JobSource" ADD VALUE 'CAREERS';
ALTER TYPE "JobSource" ADD VALUE 'EMAIL';
