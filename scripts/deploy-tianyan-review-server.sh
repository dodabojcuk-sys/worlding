#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_NODE_VERSION="v22.22.0"
readonly REPOSITORY_URL="https://github.com/dodabojcuk-sys/worlding.git"
readonly SERVICE_USER="tianyan-review"
readonly INSTALL_ROOT="/opt/tianyan-review"
readonly DATA_ROOT="/srv/tianyan-review"
readonly CONFIG_ROOT="/etc/tianyan-review"
readonly APP_PORT="4194"
readonly PUBLIC_ORIGIN="https://tianyan.worlding.world"
readonly PROVIDER_CREDENTIAL_DIR="${CONFIG_ROOT}/credentials"
readonly PROVIDER_CREDENTIAL_FILE="${PROVIDER_CREDENTIAL_DIR}/provider-credential"
readonly PROVIDER_AUTHORIZATION_RECEIPT_ID="review-deployment.product-path.r1"
readonly PROVIDER_PRODUCT_GENERATION_BUDGET="40"
readonly PROVIDER_PRODUCT_TOTAL_BUDGET="60"

die() {
  printf 'deployment error: %s\n' "$*" >&2
  exit 1
}

[[ ${EUID} -eq 0 ]] || die "run as root"
[[ $# -eq 1 ]] || die "usage: $0 <40-character-commit-sha>"
readonly RELEASE_SHA="$1"
[[ ${RELEASE_SHA} =~ ^[0-9a-f]{40}$ ]] || die "release SHA is invalid"
[[ $(node --version) == "${EXPECTED_NODE_VERSION}" ]] || die "Node ${EXPECTED_NODE_VERSION} is required"
command -v git >/dev/null || die "git is required"
command -v curl >/dev/null || die "curl is required"
command -v openssl >/dev/null || die "openssl is required"

if ss -H -ltn "sport = :${APP_PORT}" | grep -q . && [[ ! -f /etc/systemd/system/tianyan-review.service ]]; then
  die "application port ${APP_PORT} is already in use"
fi

if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${DATA_ROOT}" --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

install -d -m 0755 "${INSTALL_ROOT}/releases" "${INSTALL_ROOT}/backups"
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 0750 "${DATA_ROOT}"
install -d -o root -g "${SERVICE_USER}" -m 0750 "${CONFIG_ROOT}"
# Provider credentials live in one permission-isolated file outside the story
# library.  The service user owns the directory so the product can save,
# replace, and clear the credential through its own settings flow.
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 0700 "${PROVIDER_CREDENTIAL_DIR}"

readonly RELEASE_DIR="${INSTALL_ROOT}/releases/${RELEASE_SHA}"
if [[ ! -d "${RELEASE_DIR}/.git" ]]; then
  rm -rf "${RELEASE_DIR}"
  git clone --filter=blob:none --no-checkout "${REPOSITORY_URL}" "${RELEASE_DIR}"
  git -C "${RELEASE_DIR}" fetch --depth 1 origin "${RELEASE_SHA}"
  git -C "${RELEASE_DIR}" checkout --detach "${RELEASE_SHA}"
fi
[[ $(git -C "${RELEASE_DIR}" rev-parse HEAD) == "${RELEASE_SHA}" ]] || die "checked-out SHA differs"

if [[ ! -f "${RELEASE_DIR}/apps/story-studio/dist/index.html" ]]; then
  npm --prefix "${RELEASE_DIR}" ci
  npm --prefix "${RELEASE_DIR}" run build
fi

readonly LIBRARY_ROOT="${DATA_ROOT}/library"
if [[ ! -e "${LIBRARY_ROOT}" ]]; then
  install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 0750 "${LIBRARY_ROOT}"
  runuser -u "${SERVICE_USER}" -- env HOME="${DATA_ROOT}" \
    node --experimental-strip-types "${RELEASE_DIR}/scripts/prepare-tianyan-review-library.mjs" "${LIBRARY_ROOT}"
fi

readonly PASSWORD_FILE="${CONFIG_ROOT}/review-password"
if [[ ! -s "${PASSWORD_FILE}" ]]; then
  umask 0027
  openssl rand -hex 16 >"${PASSWORD_FILE}"
fi
chown root:"${SERVICE_USER}" "${PASSWORD_FILE}"
chmod 0640 "${PASSWORD_FILE}"

cat >"${CONFIG_ROOT}/runtime.env" <<EOF
NODE_ENV=production
PORT=${APP_PORT}
TIANYAN_RUNTIME_CODE_REVISION=${RELEASE_SHA}
WORLD_OS_STORY_STUDIO_ROOT=${LIBRARY_ROOT}
WORLD_OS_STORY_STUDIO_STATE_FILE=${LIBRARY_ROOT}/.story-studio/state.json
TIANYAN_PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
TIANYAN_REVIEW_USERNAME=reviewer
TIANYAN_REVIEW_PASSWORD_FILE=${PASSWORD_FILE}
TIANYAN_CREDENTIAL_BACKEND=PRODUCTION_FILE
TIANYAN_CREDENTIAL_FILE_PATH=${PROVIDER_CREDENTIAL_FILE}
TIANYAN_REAL_PROVIDER_PRODUCT_PATH=1
TIANYAN_PROVIDER_AUTHORIZATION_RECEIPT_ID=${PROVIDER_AUTHORIZATION_RECEIPT_ID}
TIANYAN_PROVIDER_PRODUCT_GENERATION_BUDGET=${PROVIDER_PRODUCT_GENERATION_BUDGET}
TIANYAN_PROVIDER_PRODUCT_TOTAL_BUDGET=${PROVIDER_PRODUCT_TOTAL_BUDGET}
TIANYAN_NUWA_N1_PI_ADAPTER=1
EOF
chown root:"${SERVICE_USER}" "${CONFIG_ROOT}/runtime.env"
chmod 0640 "${CONFIG_ROOT}/runtime.env"

systemctl stop tianyan-review-proxy.socket tianyan-review-proxy.service tianyan-review.service 2>/dev/null || true
if [[ -L "${INSTALL_ROOT}/current" ]]; then
  previous_release=$(readlink -f "${INSTALL_ROOT}/current")
  ln -sfn "${previous_release}" "${INSTALL_ROOT}/backups/previous"
fi
ln -sfn "${RELEASE_DIR}" "${INSTALL_ROOT}/current"

# Public traffic terminates on the local Nginx vhost (TLS for
# tianyan.worlding.world) and is proxied to the loopback application port, so
# the old systemd-socket-proxyd units are retired here.
cat >/etc/systemd/system/tianyan-review.service <<EOF
[Unit]
Description=Tianyan synthetic review application
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_ROOT}/current
EnvironmentFile=${CONFIG_ROOT}/runtime.env
ExecStart=/usr/local/bin/npm run serve
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_ROOT} ${PROVIDER_CREDENTIAL_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now tianyan-review.service
for _ in $(seq 1 30); do
  if curl --fail --silent --output /dev/null "http://127.0.0.1:${APP_PORT}/__review/login"; then
    break
  fi
  sleep 1
done
curl --fail --silent --output /dev/null "http://127.0.0.1:${APP_PORT}/__review/login" || die "application did not become ready"
systemctl disable --now tianyan-review-proxy.socket tianyan-review-proxy.service 2>/dev/null || true
rm -f /etc/systemd/system/tianyan-review-proxy.socket /etc/systemd/system/tianyan-review-proxy.service
systemctl daemon-reload

readonly UNAUTH_STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:${APP_PORT}/__local/story-studio/state")
[[ ${UNAUTH_STATUS} == "401" ]] || die "unauthenticated API check returned ${UNAUTH_STATUS}"
readonly LOGIN_HEADERS=$(mktemp)
trap 'rm -f "${LOGIN_HEADERS}"' EXIT
readonly LOGIN_STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --dump-header "${LOGIN_HEADERS}" \
  --data-urlencode "username=reviewer" \
  --data-urlencode "password=$(cat "${PASSWORD_FILE}")" \
  "http://127.0.0.1:${APP_PORT}/__review/login")
[[ ${LOGIN_STATUS} == "303" ]] || die "review login check returned ${LOGIN_STATUS}"
readonly REVIEW_COOKIE=$(awk 'tolower($1) == "set-cookie:" && $2 ~ /^tianyan_review_access=/ { sub(/;.*/, "", $2); print $2 }' "${LOGIN_HEADERS}")
[[ -n ${REVIEW_COOKIE} ]] || die "review login did not return an access cookie"
readonly SESSION_STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header "Cookie: ${REVIEW_COOKIE}" "http://127.0.0.1:${APP_PORT}/__review/session")
[[ ${SESSION_STATUS} == "200" ]] || die "authenticated session check returned ${SESSION_STATUS}"

if [[ ${PUBLIC_ORIGIN} == https://* ]]; then
  readonly PUBLIC_HOST=$(printf '%s' "${PUBLIC_ORIGIN}" | sed -E 's#https://([^/:]+).*#\1#')
  readonly PUBLIC_STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --resolve "${PUBLIC_HOST}:443:127.0.0.1" "${PUBLIC_ORIGIN}/__local/story-studio/health")
  [[ ${PUBLIC_STATUS} == "401" ]] || die "public HTTPS health check returned ${PUBLIC_STATUS} (expected 401 without login)"
fi

printf 'deployment complete\n'
printf 'release_sha=%s\n' "${RELEASE_SHA}"
printf 'public_origin=%s\n' "${PUBLIC_ORIGIN}"
printf 'app_listener=127.0.0.1:%s\n' "${APP_PORT}"
printf 'credential_backend=PRODUCTION_FILE\n'
printf 'provider_credential_file=%s\n' "${PROVIDER_CREDENTIAL_FILE}"
printf 'provider_authorization_receipt=%s\n' "${PROVIDER_AUTHORIZATION_RECEIPT_ID}"
printf 'review_username=reviewer\n'
printf 'review_password_file=%s\n' "${PASSWORD_FILE}"
printf 'synthetic_library=%s\n' "${LIBRARY_ROOT}"
