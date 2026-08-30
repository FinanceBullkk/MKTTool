#!/usr/bin/env bash
set -euo pipefail

# GitHub's service container exposes PostgreSQL on the runner's localhost, while the self-hosted
# runner intentionally has no host-installed psql. Use the already-pinned postgres image as a
# disposable client. The workspace is mounted at the same absolute path so --file arguments from
# the Node verifier remain valid. Environment names are forwarded without putting their values in
# Docker's argv or in the job log.
workspace="${GITHUB_WORKSPACE:-$PWD}"
docker_args=(run --rm --network host -v "${workspace}:${workspace}")
for name in PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSSLMODE; do
  if [[ -n "${!name:-}" ]]; then
    docker_args+=(--env "$name")
  fi
done

exec docker "${docker_args[@]}" postgres:16 psql "$@"
