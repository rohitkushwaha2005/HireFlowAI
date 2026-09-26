-- Runs once when the Postgres volume is first initialized.
-- The `vector` extension for the main database is created by the Prisma migration.
CREATE DATABASE hireflow_test OWNER hireflow;
