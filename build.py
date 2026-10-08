#!/usr/bin/env python3
"""Сборка «Буксиратора».

    python3 build.py

Читает src/page.html (разметка и стили), src/app.js (вся логика) и
vendor/ (кодировщик GIF и муксеры MP4/WebM) и пишет два файла:

    Buksirator.html      автономная страница, открывается двойным кликом
    dist/artifact.html   то же без обёртки <html>, для публикации артефактом
"""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent
page = (root / 'src/page.html').read_text(encoding='utf-8')
app = (root / 'src/app.js').read_text(encoding='utf-8')
gif = (root / 'vendor/gifenc.esm.js').read_text(encoding='utf-8')

# gifenc поставляется ES-модулем: превращаем export{...} в объект GIFENC
gif = re.sub(r'//# sourceMappingURL=.*', '', gif).strip()
m = re.search(r'export\{([^}]*)\};?\s*$', gif)
names = {}
for part in m.group(1).split(','):
    a, _, b = part.partition(' as ')
    names[b.strip() or a.strip()] = a.strip()
ret = ','.join(f'{k}:{v}' for k, v in names.items() if k != 'default')
gif = gif[:m.start()] + 'return{' + ret + '};'
lib = ('<script>\n/* gifenc 1.0.3, (c) 2017 Matt DesLauriers, MIT licence. https://github.com/mattdesl/gifenc */\n'
       'const GIFENC=(function(){' + gif + '})();\n</script>\n')

# муксеры видео уже собраны как обычные скрипты с глобальными Mp4Muxer и WebMMuxer
for name, title in (('mp4-muxer', 'mp4-muxer 5.2.2'), ('webm-muxer', 'webm-muxer 5.1.4')):
    code = (root / f'vendor/{name}.min.js').read_text(encoding='utf-8').strip()
    lib += (f'<script>\n/* {title}, (c) 2023 Vanilagy, MIT licence. https://github.com/Vanilagy/{name} */\n'
            + code + '\n</script>\n')

body = page + '\n' + lib + '<script>\n' + app + '\n</script>\n'
full = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n'
        '</head>\n<body>\n' + body + '</body>\n</html>\n')

(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/artifact.html').write_text(body, encoding='utf-8')
(root / 'Buksirator.html').write_text(full, encoding='utf-8')
print(f'Готово: Buksirator.html ({len(full.encode("utf-8")) // 1024} КБ), dist/artifact.html')
