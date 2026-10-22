#!/usr/bin/env bash
# Opens a secure tunnel from this PC to the private Cooper Waters database.
#
#   ./scripts/db-tunnel.sh [local-port]      (default local port 15432)
#
# Leave it running, then connect pgAdmin/DBeaver/psql to:
#   host localhost, port 15432, database cooper, user cooper, SSL mode "require"
# Password: the part between "cooper:" and "@" in Secrets Manager cooper-waters-prod/DATABASE_URL.
#
# Needs: AWS CLI v2, the Session Manager plugin, and enable_db_tunnel = true in terraform.tfvars.
set -euo pipefail
export MSYS_NO_PATHCONV=1

LOCAL_PORT="${1:-15432}"
TF_DIR="$(cd "$(dirname "$0")/../infra/terraform" && pwd)"

# Run terraform from inside its folder (Windows terraform.exe can't read /c/... paths in -chdir).
cd "$TF_DIR"
INSTANCE_ID="$(terraform output -raw db_tunnel_instance_id 2>/dev/null || true)"
DB_HOST="$(terraform output -raw db_endpoint)"
REGION="$(terraform output -raw region 2>/dev/null || echo ap-southeast-2)"

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "null" ]; then
  echo "No tunnel host. Set enable_db_tunnel = true in infra/terraform/terraform.tfvars and run terraform apply." >&2
  exit 1
fi

echo "Tunnel: localhost:${LOCAL_PORT} -> ${DB_HOST}:5432 (via ${INSTANCE_ID}). Press Ctrl+C to close."
aws ssm start-session \
  --region "$REGION" \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"${DB_HOST}\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}"
