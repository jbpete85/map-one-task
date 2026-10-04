# Installs or updates the hosted agent mapper on the Mac mini. Run on the mini: python3 deploy/install-mini.py
# Never overwrites an existing .env. Starts behind agent-preflight.sh so it waits for DNS after a reboot.
from pathlib import Path
import os, secrets, subprocess, plistlib
root = Path.home() / 'kingside/agent-mapper'
for name in ['logs', 'data']: (root / name).mkdir(parents=True, exist_ok=True)
envpath = root / '.env'
if not envpath.exists():
    source = Path.home() / 'kingside/ai-design-lab/.env'
    key = next((l.split('=', 1)[1].strip().strip('"\'') for l in source.read_text().splitlines() if l.startswith('OPENROUTER_API_KEY=')), None)
    if not key: raise SystemExit('OpenRouter key unavailable. No configuration written.')
    code = 'MAP-' + secrets.token_hex(3).upper()
    envpath.write_text(f'OPENROUTER_API_KEY={key}\nPRESENTER_CODE={code}\nBASE_PATH=/agent-mapper\nALLOWED_ORIGINS=https://jbpete85.github.io\nPORT=8130\nDAILY_BUDGET_USD=5\n')
    os.chmod(envpath, 0o600)
code = next(l.split('=', 1)[1] for l in envpath.read_text().splitlines() if l.startswith('PRESENTER_CODE='))
node = Path.home() / '.local/bin/node'
label = 'com.kingside.agent-mapper'
plist = Path.home() / f'Library/LaunchAgents/{label}.plist'
job = {'Label': label,
       'ProgramArguments': [str(Path.home() / 'kingside/bin/agent-preflight.sh'), str(node), '--env-file=' + str(envpath), str(root / 'server.mjs')],
       'WorkingDirectory': str(root), 'RunAtLoad': True, 'KeepAlive': True,
       'StandardOutPath': str(root / 'logs/server.log'), 'StandardErrorPath': str(root / 'logs/error.log')}
plist.write_bytes(plistlib.dumps(job))
domain = f'gui/{os.getuid()}'
subprocess.run(['launchctl', 'bootout', domain + '/' + label], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
subprocess.run(['launchctl', 'bootstrap', domain, str(plist)], check=True)
print('Presenter code: ' + code)
print('Service installed: ' + label)
