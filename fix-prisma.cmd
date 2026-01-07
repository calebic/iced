@echo off
setlocal

set "SCHEMA_PATH=..\..\prisma\schema.prisma"

set "MIGRATE_MODE=%MIGRATE_MODE%"

if not defined DATABASE_URL (
  echo DATABASE_URL is not set. Skipping Prisma migrations.
  goto :eof
)

echo Running pnpm install...
pnpm install
if errorlevel 1 (
  echo pnpm install failed. Fix errors and re-run.
  exit /b 1
)

echo Generating Prisma client...
pnpm -C apps\api exec prisma generate --schema %SCHEMA_PATH%
if errorlevel 1 (
  echo Prisma client generation failed. Fix errors and re-run.
  exit /b 1
)

echo Running Prisma migrations...
pnpm -C apps\api exec prisma migrate dev --schema %SCHEMA_PATH%
if errorlevel 1 (
  echo Prisma migrate dev failed. You can retry with MIGRATE_MODE=reset to reset the database.
  if /I "%MIGRATE_MODE%"=="reset" (
    echo MIGRATE_MODE=reset detected. Running prisma migrate reset --force...
    pnpm -C apps\api exec prisma migrate reset --force --schema %SCHEMA_PATH%
    if errorlevel 1 (
      echo Prisma migrate reset failed. Fix errors and re-run.
      exit /b 1
    )
  ) else (
    exit /b 1
  )
)

echo Verifying API key metadata column...
(
  echo SELECT api_key_last4 FROM api_keys LIMIT 1;
) | pnpm -C apps\api exec prisma db execute --schema %SCHEMA_PATH% --stdin
if errorlevel 1 (
  echo api_keys.api_key_last4 column missing. Rerun migrations to sync the schema.
  exit /b 1
)

echo Prisma schema is in sync.
exit /b 0
