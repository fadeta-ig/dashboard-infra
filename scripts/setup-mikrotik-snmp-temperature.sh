#!/usr/bin/env bash
set -euo pipefail

TARGET_IP="${TARGET_IP:-192.168.20.1}"
AUTH_NAME="${AUTH_NAME:-v2c_mikrotik}"
SNMP_EXPORTER_CONFIG="${SNMP_EXPORTER_CONFIG:-/etc/snmp_exporter/snmp.yml}"
PROMETHEUS_CONFIG="${PROMETHEUS_CONFIG:-/etc/prometheus/prometheus.yml}"
SNMP_EXPORTER_URL="${SNMP_EXPORTER_URL:-http://127.0.0.1:9116}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://127.0.0.1:9090}"
SNMP_EXPORTER_SERVICE="${SNMP_EXPORTER_SERVICE:-snmp_exporter}"
PROMETHEUS_SERVICE="${PROMETHEUS_SERVICE:-prometheus}"
SNMP_MODULE_NAME="${SNMP_MODULE_NAME:-mikrotik_temperature}"
PROM_JOB_NAME="${PROM_JOB_NAME:-snmp_mikrotik_temperature}"
METRIC_NAME="${METRIC_NAME:-mtxrHlTemperature}"
TEMPERATURE_OID="${TEMPERATURE_OID:-1.3.6.1.4.1.14988.1.1.3.10.0}"
RUN_RESTARTS="${RUN_RESTARTS:-1}"

SUDO_BIN=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO_BIN="sudo"
fi

run_root() {
  if [ -n "${SUDO_BIN}" ]; then
    "${SUDO_BIN}" "$@"
  else
    "$@"
  fi
}

require_file() {
  local path="$1"
  if [ ! -f "${path}" ]; then
    echo "Config not found: ${path}" >&2
    exit 1
  fi
}

backup_file() {
  local path="$1"
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  run_root cp "${path}" "${path}.bak.${stamp}"
  echo "Backup created: ${path}.bak.${stamp}"
}

append_snmp_module() {
  if run_root grep -qE "^  ${SNMP_MODULE_NAME}:" "${SNMP_EXPORTER_CONFIG}"; then
    echo "SNMP module '${SNMP_MODULE_NAME}' already exists. Skip."
    return
  fi

  run_root tee -a "${SNMP_EXPORTER_CONFIG}" >/dev/null <<EOF

  ${SNMP_MODULE_NAME}:
    walk:
    - 1.3.6.1.4.1.14988
    max_repetitions: 10
    retries: 3
    timeout: 10s
    metrics:
    - name: ${METRIC_NAME}
      oid: ${TEMPERATURE_OID}
      type: gauge
      help: MikroTik temperature in celsius.
EOF

  echo "Added SNMP exporter module '${SNMP_MODULE_NAME}'."
}

append_prometheus_job() {
  if run_root grep -qE "job_name:[[:space:]]*\"?${PROM_JOB_NAME}\"?" "${PROMETHEUS_CONFIG}"; then
    echo "Prometheus job '${PROM_JOB_NAME}' already exists. Skip."
    return
  fi

  local temp_file
  temp_file="$(mktemp)"

  if ! awk \
    -v job_name="${PROM_JOB_NAME}" \
    -v module_name="${SNMP_MODULE_NAME}" \
    -v auth_name="${AUTH_NAME}" \
    -v target_ip="${TARGET_IP}" \
    '
      function print_job() {
        print "  - job_name: \"" job_name "\""
        print "    metrics_path: /snmp"
        print "    params:"
        print "      module: [\"" module_name "\"]"
        print "      auth: [\"" auth_name "\"]"
        print "    static_configs:"
        print "      - targets:"
        print "          - " target_ip
        print "    relabel_configs:"
        print "      - source_labels: [__address__]"
        print "        target_label: __param_target"
        print "      - source_labels: [__param_target]"
        print "        target_label: instance"
        print "      - target_label: __address__"
        print "        replacement: 127.0.0.1:9116"
      }
      BEGIN {
        in_scrape = 0
        inserted = 0
        saw_scrape = 0
      }
      {
        if ($0 ~ /^scrape_configs:[[:space:]]*$/) {
          in_scrape = 1
          saw_scrape = 1
          print
          next
        }

        if (in_scrape && !inserted && $0 ~ /^[^[:space:]#][^:]*:[[:space:]]*$/) {
          print_job()
          print ""
          inserted = 1
          in_scrape = 0
        }

        print
      }
      END {
        if (in_scrape && !inserted) {
          print_job()
          inserted = 1
        }
        if (!saw_scrape) {
          exit 9
        }
      }
    ' "${PROMETHEUS_CONFIG}" > "${temp_file}"; then
    rm -f "${temp_file}"
    echo "Failed to inject Prometheus job into ${PROMETHEUS_CONFIG}. Ensure scrape_configs exists." >&2
    exit 1
  fi

  run_root cp "${temp_file}" "${PROMETHEUS_CONFIG}"
  rm -f "${temp_file}"
  echo "Added Prometheus job '${PROM_JOB_NAME}'."
}

setup_recording_rule() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if [ ! -f "${script_dir}/setup-mikrotik-temperature.sh" ]; then
    echo "Recording rule helper not found: ${script_dir}/setup-mikrotik-temperature.sh" >&2
    return
  fi

  MIKROTIK_INSTANCE="${TARGET_IP}" bash "${script_dir}/setup-mikrotik-temperature.sh"
}

restart_service() {
  local service_name="$1"
  if [ "${RUN_RESTARTS}" != "1" ]; then
    echo "Skip restart for ${service_name} because RUN_RESTARTS=${RUN_RESTARTS}."
    return
  fi

  run_root systemctl restart "${service_name}"
  echo "Restarted service: ${service_name}"
}

verify_raw_metric() {
  echo
  echo "Raw SNMP exporter check:"
  echo "  curl -s '${SNMP_EXPORTER_URL}/snmp?target=${TARGET_IP}&module=${SNMP_MODULE_NAME}&auth=${AUTH_NAME}' | grep -E '^${METRIC_NAME}'"
}

verify_prometheus_metric() {
  echo
  echo "Prometheus checks:"
  echo "  curl -g -s '${PROMETHEUS_URL}/api/v1/query?query=up{job=\"${PROM_JOB_NAME}\"}'"
  echo "  curl -g -s '${PROMETHEUS_URL}/api/v1/query?query=${METRIC_NAME}{instance=\"${TARGET_IP}\"}'"
  echo "  curl -g -s '${PROMETHEUS_URL}/api/v1/query?query=mikrotik_temperature_celsius{instance=\"${TARGET_IP}\"}'"
}

require_file "${SNMP_EXPORTER_CONFIG}"
require_file "${PROMETHEUS_CONFIG}"

backup_file "${SNMP_EXPORTER_CONFIG}"
backup_file "${PROMETHEUS_CONFIG}"

append_snmp_module
append_prometheus_job
setup_recording_rule
restart_service "${SNMP_EXPORTER_SERVICE}"
restart_service "${PROMETHEUS_SERVICE}"
verify_raw_metric
verify_prometheus_metric
