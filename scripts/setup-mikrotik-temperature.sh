#!/usr/bin/env bash
set -euo pipefail

MIKROTIK_INSTANCE="${MIKROTIK_INSTANCE:-192.168.20.1}"
PROMETHEUS_RULES_DIR="${PROMETHEUS_RULES_DIR:-/etc/prometheus/rules}"
RULE_FILE="${PROMETHEUS_RULES_DIR}/mikrotik-temperature.rules.yml"
PROMETHEUS_RELOAD_URL="${PROMETHEUS_RELOAD_URL:-http://127.0.0.1:9090/-/reload}"
SUDO_BIN=""

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO_BIN="sudo"
fi

write_rule_file() {
  if [ -n "${SUDO_BIN}" ]; then
    ${SUDO_BIN} mkdir -p "${PROMETHEUS_RULES_DIR}"
    ${SUDO_BIN} tee "${RULE_FILE}" >/dev/null
  else
    mkdir -p "${PROMETHEUS_RULES_DIR}"
    cat > "${RULE_FILE}"
  fi
}

write_rule_file <<EOF
groups:
  - name: mikrotik-temperature
    interval: 30s
    rules:
      - record: mikrotik_temperature_celsius
        expr: |
          max by (instance) (
            mtxrHlTemperature{instance="${MIKROTIK_INSTANCE}"}
            or mtxrHlTemp{instance="${MIKROTIK_INSTANCE}"}
            or mtxrSystemTemperature{instance="${MIKROTIK_INSTANCE}"}
            or mikrotikTemperature{instance="${MIKROTIK_INSTANCE}"}
            or (entPhySensorValue{instance="${MIKROTIK_INSTANCE}"} / 10)
          )
EOF

echo "Rule file written: ${RULE_FILE}"
echo
echo "Pastikan prometheus.yml sudah memuat folder rules ini, misalnya:"
echo "rule_files:"
echo "  - /etc/prometheus/rules/*.yml"
echo
echo "Reload Prometheus:"
echo "  curl -X POST ${PROMETHEUS_RELOAD_URL}"
echo "  Jika muncul 'Lifecycle API is not enabled', reload service Prometheus via systemd atau aktifkan --web.enable-lifecycle."
echo
echo "Verifikasi metric suhu setelah reload:"
echo "  curl -g -s 'http://127.0.0.1:9090/api/v1/query?query=mikrotik_temperature_celsius{instance=\"${MIKROTIK_INSTANCE}\"}'"
echo
echo "Jika hasil masih kosong, berarti SNMP exporter belum mengeluarkan metric suhu dari MikroTik."
echo "Lanjutkan cek metric mentah yang mengandung temp/thermal:"
echo "  curl -s 'http://127.0.0.1:9090/api/v1/label/__name__/values' | grep -Ei 'temp|thermal|mtxr'"
