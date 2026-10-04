# Adds the /agent-mapper path rule to the existing kingside-mini tunnel. Run on the mini with sudo.
# Rollback: remove the rule (or restore config.yml.bak-pre-agent-mapper, keeping later additions) and kickstart cloudflared.
from pathlib import Path
import subprocess, shutil
config = Path('/etc/cloudflared/config.yml')
s = config.read_text()
needle = '  - hostname: ops.kingsidegroup.com\n    service: http://localhost:8080'
rule = '  # Workshop agent mapper. Paid calls require the presenter code.\n  - hostname: ops.kingsidegroup.com\n    path: ^/agent-mapper(/.*)?$\n    service: http://localhost:8130\n\n'
if 'service: http://localhost:8130' in s: raise SystemExit('Route already present. Tunnel left unchanged.')
if needle not in s: raise SystemExit('Expected ops rule not found. Tunnel left unchanged.')
backup = config.with_name('config.yml.bak-pre-agent-mapper')
if not backup.exists(): shutil.copy2(config, backup)
config.write_text(s.replace(needle, rule + needle, 1))
try: subprocess.run(['/opt/homebrew/bin/cloudflared', 'tunnel', '--config', str(config), 'ingress', 'validate'], check=True)
except Exception:
    config.write_text(s); raise
subprocess.run(['launchctl', 'kickstart', '-k', 'system/com.cloudflare.cloudflared'], check=True)
print('Agent mapper route ready. Existing ops routes retained.')
