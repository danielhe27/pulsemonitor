import os
import time
import socket
import requests
import psutil
from datetime import datetime

# -----------------------------
# Config (override with env vars)
# -----------------------------
DEFAULT_SERVER = os.getenv("PULSEMONITOR_SERVER", "http://127.0.0.1:5050")
API_URL = os.getenv("PULSEMONITOR_API", f"{DEFAULT_SERVER}/api/pi/ingest")

PI_ID = os.getenv("PI_ID", "pi-mac")
NAME = os.getenv("PI_NAME", socket.gethostname())
INTERVAL_S = int(os.getenv("INTERVAL_S", "5"))

# Optional token support (only needed if you set PI_INGEST_TOKEN on server)
PI_TOKEN = os.getenv("PI_INGEST_TOKEN", "")

# -----------------------------
# Helpers
# -----------------------------
def get_ip():
    """
    Best effort to return LAN IP.
    Falls back to 127.0.0.1 only if we cannot determine it.
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def mb(x):
    return int(x / (1024 * 1024))

def gb(x):
    return round(x / (1024 * 1024 * 1024), 2)

def build_payload():
    cpu_usage = psutil.cpu_percent(interval=None)

    vm = psutil.virtual_memory()
    mem_total = mb(vm.total)
    mem_used = mb(vm.used)

    du = psutil.disk_usage("/")
    disk_total = gb(du.total)
    disk_used = gb(du.used)

    uptime_s = int(time.time() - psutil.boot_time())

    return {
        "piId": PI_ID,
        "name": NAME,
        "cpuTempC": None,     # macOS temp not available without extra tooling
        "cpuUsage": float(cpu_usage),
        "memTotalMb": mem_total,
        "memUsedMb": mem_used,
        "diskTotalGb": disk_total,
        "diskUsedGb": disk_used,
        "uptimeS": uptime_s,
        "ip": get_ip(),       # ✅ FIXED
    }

def post_metrics(session: requests.Session, data: dict):
    headers = {}
    if PI_TOKEN:
        headers["x-pi-token"] = PI_TOKEN

    r = session.post(API_URL, json=data, headers=headers, timeout=5)
    r.raise_for_status()
    return r.json() if r.content else {}

# -----------------------------
# Main loop
# -----------------------------
def main():
    print("PulseMonitor agent started")
    print(f"PI_ID={PI_ID}")
    print(f"NAME={NAME}")
    print(f"API_URL={API_URL}")
    print(f"INTERVAL_S={INTERVAL_S}")
    print("")

    session = requests.Session()

    while True:
        data = build_payload()
        ts = datetime.now().strftime("%H:%M:%S")

        try:
            resp = post_metrics(session, data)
            print(
                f"[{ts}] sent ✅ {data['piId']} "
                f"cpu={data['cpuUsage']:.1f}% "
                f"mem={data['memUsedMb']}/{data['memTotalMb']}MB "
                f"disk={data['diskUsedGb']}/{data['diskTotalGb']}GB "
                f"ip={data['ip']} resp={resp}"
            )
        except Exception as e:
            print(f"[{ts}] send error ❌ {e}")

        time.sleep(INTERVAL_S)

if __name__ == "__main__":
    main()