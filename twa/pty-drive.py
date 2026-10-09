#!/usr/bin/env python3
import os, pty, sys, time, select

mode = sys.argv[1] if len(sys.argv) > 1 else 'build'
build_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), 'build')
BW_VERSION = '1.25.0'

cmd = None
if mode == 'build':
    cmd = ['corepack', 'pnpm', 'dlx', f'@bubblewrap/cli@{BW_VERSION}', 'build', '--skipPwaValidation', f'--directory={build_dir}']
elif mode == 'init':
    cmd = ['corepack', 'pnpm', 'dlx', f'@bubblewrap/cli@{BW_VERSION}', 'init', '--manifest', 'https://aflivra.brebu.workers.dev/manifest.webmanifest', f'--directory={build_dir}']
else:
    sys.exit(2)

pid, fd = pty.fork()
if pid == 0:
    os.environ.setdefault('ANDROID_HOME', '/opt/homebrew/share/android-commandlinetools')
    os.environ['PATH'] = os.environ.get('PATH', '/usr/bin:/bin')
    # build lucrează în directorul curent (citește ./twa-manifest.json) — intrăm în el.
    if mode == 'build':
        os.chdir(build_dir)
        cmd = ['corepack', 'pnpm', 'dlx', f'@bubblewrap/cli@{BW_VERSION}', 'build', '--skipPwaValidation']
    os.execvp(cmd[0], cmd)

buf = b''
sent = 0
last_answer = ''
idle = 0.0
deadline = time.time() + 2400
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 1.0)
    if r:
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        buf += chunk
        sys.stdout.write(chunk.decode('utf-8', 'replace')); sys.stdout.flush()
        idle = 0.0
    else:
        idle += 1.0
        if idle >= 3.0:
            # Prompt așteaptă. Interviul de certificat cere valori reale, nu Enter:
            # identitatea publisher-ului + parola de semnare din mediu — niciodată în script.
            tail = buf[-700:].decode('utf-8', 'replace')
            import re as _re
            labels = _re.findall(r'\x1b\[1m([^\x1b]{2,70}):\x1b\[22m', tail)
            raw = (labels[-1] if labels else '').lower()
            # keytool DN interview: eticheta curățată de exemplu-în-paranteze
            # («Country (2 letter code)» -> «country») Decide răspunsul.
            clean = raw.split('(')[0].strip()
            pw = os.environ.get('BUBBLEWRAP_KEYSTORE_PASSWORD', '')
            answers = [
                ('first and last names', 'Ciprian Brebu'),
                ('organizational unit', 'Aflivra'),
                ('organization', 'Aflivra'),
                ('city or locality', 'Bucharest'),
                ('locality', 'Bucharest'),
                ('state or province', 'Bucharest'),
                ('country', 'RO'),
                ('keystore password', pw),
                ('key password', pw),
                ('password', pw),
            ]
            hit = next((v for k, v in answers if clean.startswith(k)), None)
            if hit is not None and hit != '':
                os.write(fd, hit.encode() + b'\r')
            else:
                os.write(fd, b'\r')
            sent += 1
            idle = 0.0
    if b'BUILD FAILED' in buf:
        time.sleep(3)
        break
try:
    os.close(fd)
except OSError:
    pass
try:
    _, status = os.waitpid(pid, 0)
except ChildProcessError:
    status = -1
print(f'\n[pty] enter={sent} status={status}')
sys.exit(os.waitstatus_to_exitcode(status) if status >= 0 else 1)
