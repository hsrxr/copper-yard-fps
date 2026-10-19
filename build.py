"""Build a fully inline HTML. Only Python's standard library is used."""
from pathlib import Path
import hashlib
root=Path(__file__).resolve().parent
files=['vendor/three-r160.min.js','src/random.js','src/arena.js','src/atmosphere.js','src/post.js','src/display.js','src/combat.js','src/mission.js','src/career.js','src/player.js','src/enemies.js','src/effects.js','src/minimap.js','src/hud.js','src/viewmodel.js','src/app.js']
parts=[]
for name in files:
    code=(root/name).read_text(encoding='utf-8')
    # Prevent an embedded JS string/comment from prematurely closing its script tag.
    code=code.replace('</script','<\\/script')
    parts.append('<script>\n/* Embedded source: '+name+' */\n'+code+'\n</script>')
license=(root/'vendor/THREE-LICENSE.txt').read_text(encoding='utf-8')
html=(root/'src/shell.html').read_text(encoding='utf-8').replace('<!-- SCRIPTS -->','<!-- Three.js r160 MIT License\n'+license+'\n-->\n'+'\n'.join(parts))
out=root/'index.html'
out.write_bytes(html.encode('utf-8'))
print(f'Built {out.name}: {out.stat().st_size:,} bytes; SHA256 {hashlib.sha256(out.read_bytes()).hexdigest()}')
