"""Пересборка сайта Warframe Arsenal.

Берёт исходный HTML (source.html), свежие данные WFCD warframe-items
(та же база иконок, что и на Warframe Wiki), сопоставляет каждому оружию,
ресурсу и реликвии картинку, ужимает картинки и пишет site/index.html + site/thumbs.js.

Запуск:  python build.py              (для GitHub Pages)
         python build.py --artifact   (для страницы на claude.ai)
"""
import base64, datetime, io, json, os, re, shutil, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'source.html')
OUT = os.path.join(ROOT, 'site')
CACHE = os.path.join(ROOT, 'cache')
CATS = ['Primary', 'Secondary', 'Melee', 'Arch-Gun', 'Arch-Melee', 'Archwing', 'Railjack',
        'Resources', 'Misc', 'Pets', 'Sentinels', 'SentinelWeapons', 'Warframes', 'Gear', 'Relics']
CDN = 'https://cdn.jsdelivr.net/npm/@wfcd/items@latest/data/json/'
IMG = 'https://raw.githubusercontent.com/wfcd/warframe-items/master/data/img/'
SIZE = 112
ARTIFACT = '--artifact' in sys.argv

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'warframe-arsenal-build'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def fetch_json(c):
    os.makedirs(os.path.join(CACHE, 'json', 'i18n'), exist_ok=True)
    p = os.path.join(CACHE, 'json', c + '.json')
    try:
        data = get(CDN + c + '.json'); open(p, 'wb').write(data)
    except Exception as e:
        print('! не скачал', c, e, '- беру кэш'); data = open(p, 'rb').read()
    return json.loads(data)

def load_wfcd():
    items, relics = [], []
    for c in CATS:
        (relics if c == 'Relics' else items).extend(fetch_json(c))
    return items, relics

PART_RU = {'Blueprint': 'Чертёж', 'Neuroptics': 'Нейрооптика', 'Chassis': 'Каркас', 'Systems': 'Система',
           'Engine': 'Двигатель', 'Capsule': 'Капсула', 'Casing': 'Корпус', 'Weaponry': 'Вооружение',
           'Harness': 'Упряжь', 'Wings': 'Крылья', 'Carapace': 'Панцирь', 'Cerebrum': 'Мозг'}
RARITY_RU = {'Common': 'обычная', 'Uncommon': 'необычная', 'Rare': 'редкая', 'Legendary': 'легендарная'}

def build_frames(items, ru, comps, byuid, relic_vault):
    """Карточки варфреймов и некрамехов в том же формате, что и оружие."""
    out = []
    for f in items:
        if f.get('category') != 'Warframes' or not f.get('masterable'):
            continue
        prime = bool(f.get('isPrime'))
        parts, mats, any_relic_live = [], [], False
        for c in f.get('components') or []:
            uid, qty = c['uniqueName'], c.get('itemCount', 1)
            comp = comps.get(uid)
            if comp is None or 'Recipes' not in uid:
                it = byuid.get(uid)
                en = it['name'] if it else uid.rsplit('/', 1)[-1]
                mats.append({'name': (ru.get(uid) or {}).get('name') or en, 'en': en, 'qty': qty,
                             'img': it.get('imageName') if it else None})
                continue
            drops = comp.get('drops') or []
            relics = sorted({re.sub(r' Relic.*$', '', d['location']) for d in drops if ' Relic' in d['location']})
            other = sorted([d for d in drops if ' Relic' not in d['location']], key=lambda d: -(d.get('chance') or 0))
            where, rel = '', ''
            if relics:
                live = [r for r in relics if relic_vault.get(r.lower()) is False]
                any_relic_live |= bool(live)
                where = ('Реликвии Бездны. Сейчас выпадают: ' + ', '.join(live)) if live else \
                        'Реликвии Бездны — все сейчас в хранилище: открыть сохранённые, купить у игроков или ждать возвращения у Варзии.'
                rel = 'Реликвии: ' + ', '.join(relics)
            elif other:
                seen, lines = set(), []
                for d in other:
                    if d['location'] in seen: continue
                    seen.add(d['location'])
                    ch = f" — {d['chance']:g}%" if d.get('chance') else ''
                    lines.append(f"{d['location']}{ch} ({RARITY_RU.get(d.get('rarity'), d.get('rarity') or '')})")
                    if len(lines) == 4: break
                where = 'Выпадает: ' + '; '.join(lines)
            elif comp['name'] == 'Blueprint':
                where = 'Рынок в игре за кредиты, либо награда квеста / у торговца синдиката — уточните на вики.'
            else:
                where = 'Источник не указан в базе — смотрите вики.'
            parts.append({'name': PART_RU.get(comp['name'], comp['name']), 'qty': qty, 'where': where,
                          'relics': rel, 'uid': uid})
        if prime:
            method = ('Prime-варфрейм: чертёж и детали выпадают из реликвий Бездны. ' +
                      ('Часть реликвий сейчас выпадает.' if any_relic_live else
                       'Сейчас в хранилище: только сохранённые реликвии, обмен с игроками или Prime Resurgence у Варзии.'))
        else:
            src = next((p['where'][len('Выпадает: '):].split(' — ')[0] for p in parts
                        if p['where'].startswith('Выпадает: ') and p['name'] != 'Чертёж'), '')
            method = (f'Детали: {src}. Чертёж — см. строку «Чертёж» ниже.' if src else
                      'Квест, торговец или исследование клана — подробности в строках ниже и на вики.')
        name = f['name']
        out.append({'name': name, 'ru': (ru.get(f['uniqueName']) or {}).get('name') or name,
                    'category': 'Некрамехи' if f.get('type') == 'Necramech' else 'Варфреймы',
                    'type': f.get('type'), 'mr': f.get('masteryReq'), 'method': method,
                    'parts': parts, 'materials': mats, 'img': f.get('imageName'),
                    'vaulted': bool(f.get('vaulted')),
                    'source': f.get('wikiaUrl') or 'https://wiki.warframe.com/w/' + name.replace(' ', '_')})
    return out

def main():
    html = open(SRC, encoding='utf-8').read()
    m = re.search(r'<script id="data" type="application/json">(.*?)</script>', html, re.S)
    D = json.loads(m.group(1))
    items, relics = load_wfcd()

    byname = {}
    for it in items:
        if it.get('imageName'):
            byname.setdefault(it['name'].lower(), it)
    pets = [it for it in items if it.get('category') == 'Pets' and it.get('imageName')]

    def find(name):
        n = name.lower()
        if n in byname: return byname[n]
        n2 = re.sub(r'\s*\(.*?\)', '', n).strip()
        if n2 in byname: return byname[n2]
        if n.endswith(' claws'):  # когти компаньонов -> картинка питомца
            base = n[:-6]
            for p in pets:
                if p['name'].lower() == base or p['name'].lower().startswith(base + ' '):
                    return p
        if n + ' mk i' in byname: return byname[n + ' mk i']  # оружие Рэйлджека
        if n.endswith(' amp'):
            return byname.get(n[:-4] + ' prism')
        return None

    need, miss = set(), []
    for w in D['weapons']:
        it = find(w['name'])
        w['img'] = it['imageName'] if it else None
        w['vaulted'] = bool(it and it.get('vaulted'))
        if not it: miss.append(w['name'])
        for mat in w['materials']:
            r = byname.get((mat.get('en') or '').lower())
            mat['img'] = r['imageName'] if r else None
            if r: need.add(r['imageName'])
        if it: need.add(it['imageName'])
    for r in D['resources']:
        it = byname.get(r['name'].lower())
        r['img'] = it['imageName'] if it else None
        if it: need.add(it['imageName'])

    # Реликвии: актуальный статус хранилища из WFCD + иконка эры
    rel = {}
    for r in relics:
        nm = re.sub(r'\s+(Intact|Exceptional|Flawless|Radiant)$', '', r['name'])
        if r.get('imageName'):
            rel.setdefault(nm.lower(), r)
    for r in D['relics']:
        it = rel.get(r['name'].lower())
        r['img'] = it['imageName'] if it else None
        r['vaulted'] = it.get('vaulted') if it else None
        if it: need.add(it['imageName'])

    # Варфреймы и некрамехи
    ru = fetch_json('i18n/ru')
    comps = {c['uniqueName']: c for c in fetch_json('Components')}
    byuid = {it['uniqueName']: it for it in items}
    relic_vault = {k: v.get('vaulted') for k, v in rel.items()}
    frames = build_frames(items, ru, comps, byuid, relic_vault)
    for f in frames:
        if f['img']: need.add(f['img'])
        for mat in f['materials']:
            if mat.get('img'): need.add(mat['img'])
        D['counts'][f['category']] = D['counts'].get(f['category'], 0) + 1
    D['weapons'] = [w for w in D['weapons'] if w['category'] not in ('Варфреймы', 'Некрамехи')] + frames
    D['frames'] = len(frames)

    # Новое в игре: оружие из WFCD, которого нет в каталоге
    known = {w['name'].lower() for w in D['weapons']}
    fresh = []
    for it in items:
        if it.get('category') in ('Primary', 'Secondary', 'Melee', 'Arch-Gun', 'Arch-Melee') \
           and it.get('masterable') and it.get('imageName') and it['name'].lower() not in known \
           and it.get('releaseDate'):
            fresh.append({'name': it['name'], 'type': it.get('type') or it['category'],
                          'mr': it.get('masteryReq'), 'img': it['imageName'],
                          'date': it.get('releaseDate'), 'wiki': it.get('wikiaUrl') or ''})
            need.add(it['imageName'])
    fresh.sort(key=lambda x: x['date'], reverse=True)
    D['fresh'] = fresh[:60]
    D['built'] = datetime.date.today().isoformat()

    # Картинки
    os.makedirs(os.path.join(CACHE, 'img'), exist_ok=True)
    def thumb(name):
        p = os.path.join(CACHE, 'img', name + '.webp')
        if os.path.exists(p): return name, open(p, 'rb').read()
        try:
            im = Image.open(io.BytesIO(get(IMG + name))).convert('RGBA')
            im.thumbnail((SIZE, SIZE), Image.LANCZOS)
            b = io.BytesIO(); im.save(b, 'WEBP', quality=80, method=6)
            open(p, 'wb').write(b.getvalue()); return name, b.getvalue()
        except Exception as e:
            print('! картинка', name, e); return name, None
    with ThreadPoolExecutor(16) as ex:
        thumbs = {n: b for n, b in ex.map(thumb, sorted(need)) if b}

    os.makedirs(OUT, exist_ok=True)
    js = 'window.THUMBS=' + json.dumps({k: 'data:image/webp;base64,' + base64.b64encode(v).decode()
                                       for k, v in thumbs.items()}, separators=(',', ':')) + ';'
    open(os.path.join(OUT, 'thumbs.js'), 'w', encoding='utf-8').write(js)

    data = json.dumps(D, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    page = html[:m.start(1)] + data + html[m.end(1):]
    patch = open(os.path.join(ROOT, 'patch.html'), encoding='utf-8').read()
    css, header, js_patch = re.split(r'<!--HEADER-->|<!--JS-->', patch)
    page = re.sub(r'<style>.*?</style>', lambda _: '<style>\n' + css + '</style>', page, count=1, flags=re.S)
    page = re.sub(r'<header>.*?</header>', lambda _: header.strip(), page, count=1, flags=re.S)
    page = page.replace('<script>\nconst DATA', '<script src="thumbs.js"></script>\n<script>\nconst DATA', 1)
    page = page.replace('</html>', '').rstrip() + '\n' + js_patch.strip() + '\n</html>\n'
    page = page.replace('<title>Warframe — оружие и добыча</title>', '<title>Warframe Arsenal</title>')
    if ARTIFACT:  # claude.ai сам добавляет doctype/head
        page = page.replace('<!doctype html>\n<html lang="ru">', '').replace('</html>', '')
        page = re.sub(r'<meta charset="utf-8"><meta name="viewport"[^>]*>', '', page, count=1)
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)
    shutil.copy(os.path.join(ROOT, 'lore.html'), os.path.join(OUT, 'lore.html'))

    print(f'варфреймов и некрамехов: {len(frames)}')
    print(f'оружие без картинки: {len(miss)} {miss}')
    print(f'картинок: {len(thumbs)}, thumbs.js {len(js)//1024} КБ, новинок: {len(D["fresh"])}')

if __name__ == '__main__':
    main()
