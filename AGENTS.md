# Development and deployment rules

## Source of truth

The authoritative source code for this service is this Git repository.

Development checkout on the Arcanum server:

`/home/arcanoy/dev/igs-signage-attendance`

GitHub repository:

`Learn-Monitor/igs-signage-attendance`

The directory

`/srv/igs-signage-integrations/attendance`

is a production deployment directory only.

Do not develop, patch, or maintain source code directly under `/srv/igs-signage-integrations/attendance`.

## Required workflow

For every future change:

1. Modify the source under `/home/arcanoy/dev/igs-signage-attendance`.
2. Run the available tests.
3. Review the Git diff.
4. Commit the change to Git.
5. Push the commit to GitHub.
6. Deploy the committed source to `/srv/igs-signage-integrations/attendance`.
7. Rebuild/restart the Docker service.
8. Perform smoke tests against the deployed service.

The Git commit used for a deployment should be recorded whenever practical.

## Secrets

Never commit:

- `.env`
- `secrets/`
- display keys
- `ATTENDANCE_SIGNAGE_SERVICE_KEY`
- full ScreenTinker widget URLs containing `#key=...`

Secrets remain deployment-specific under:

`/srv/igs-signage-integrations/attendance/secrets/`

## Current endpoints

Production boards:

- `/integrations/attendance/board/eingang` -> `ARRIVAL`
- `/integrations/attendance/board/gts` -> `GTS`

ARRIVAL and GTS use separate display keys.

## Deployment safety

Do not replace deployment-specific `.env` or secrets from Git.

Before a structural deployment, preserve or back up the currently running deployment.

After deployment, verify at minimum:

- container is running
- ARRIVAL QR endpoint works
- GTS QR endpoint works
- existing ARRIVAL functionality has not regressed
