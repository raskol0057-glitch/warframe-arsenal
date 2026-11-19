"""Сборка сайта Warframe Arsenal (одностраничное приложение).

Берёт русский каталог из source.html, дополнения из overrides.json и свежие данные
WFCD warframe-items (та же база иконок, что на Warframe Wiki), и собирает папку site/:
  site/index.html  — приложение (копия app.html)
  site/data.json   — все данные каталога
  site/img/*.webp  — иконки 112 px

Запуск:  python build.py
"""
import datetime, io, json, os, re, shutil, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'site')
CACHE = os.path.join(ROOT, 'cache')
CATS = ['Primary', 'Secondary', 'Melee', 'Arch-Gun', 'Arch-Melee', 'Archwing', 'Railjack',
        'Resources', 'Misc', 'Pets', 'Sentinels', 'SentinelWeapons', 'Warframes', 'Gear', 'Relics']
CDN = 'https://cdn.jsdelivr.net/npm/@wfcd/items@latest/data/json/'
IMG = 'https://raw.githubusercontent.com/wfcd/warframe-items/master/data/img/'
SIZE = 112
FRAMECATS = ('Варфреймы', 'Некрамехи')

PART_RU = {'Blueprint': 'Чертёж', 'Neuroptics': 'Нейрооптика', 'Chassis': 'Каркас', 'Systems': 'Система',
           'Engine': 'Двигатель', 'Capsule': 'Капсула', 'Casing': 'Корпус', 'Weaponry': 'Вооружение',
           'Harness': 'Упряжь', 'Wings': 'Крылья', 'Carapace': 'Панцирь', 'Cerebrum': 'Мозг'}
RARITY_RU = {'Common': 'обычная', 'Uncommon': 'необычная', 'Rare': 'редкая', 'Legendary': 'легендарная'}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (warframe-arsenal-build)'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def fetch_json(name):
    p = os.path.join(CACHE, 'json', name + '.json')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    try:
        data = get(CDN + name + '.json'); open(p, 'wb').write(data)
    except Exception as e:
        print('! не скачал', name, e, '- беру кэш'); data = open(p, 'rb').read()
    return json.loads(data)


def is_gap(t):
    return (not t) or 'уточните на вики' in t or 'Источник не указан' in t


def build_frames(items, ru, comps, byuid, relic_vault, ov):
    out = []
    for f in items:
        if f.get('category') != 'Warframes' or not f.get('masterable'):
            continue
        name, prime = f['name'], bool(f.get('isPrime'))
        o = ov.get(name, {})
        parts, mats, live_any = [], [], False
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
                live_any |= bool(live)
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
            pname = PART_RU.get(comp['name'], comp['name'])
            if not where:
                where = o.get('bp') if pname == 'Чертёж' else o.get('parts')
            if not where:
                where = 'Рынок, квест или торговец — подробности на вики.' if pname == 'Чертёж' else 'Источник не указан — смотрите вики.'
            parts.append({'name': pname, 'qty': qty, 'where': where, 'relics': rel})
        if o.get('method'):
            method = o['method']
        elif prime:
            method = ('Prime-варфрейм: чертёж и детали выпадают из реликвий Бездны. ' +
                      ('Часть реликвий сейчас выпадает.' if live_any else
                       'Сейчас в хранилище: только сохранённые реликвии, обмен с игроками или Prime Resurgence у Варзии.'))
        else:
            bits = []
            if o.get('bp'): bits.append('Чертёж: ' + o['bp'].rstrip('.'))
            src = o.get('parts') or next((p['where'][len('Выпадает: '):].split(' — ')[0] for p in parts
                                           if p['where'].startswith('Выпадает: ') and p['name'] != 'Чертёж'), '')
            if src: bits.append('Детали: ' + src.rstrip('.'))
            method = '. '.join(bits) + '.' if bits else 'Подробности получения — в строках ниже и на вики.'
        out.append({'name': name, 'ru': (ru.get(f['uniqueName']) or {}).get('name') or name,
                    'category': 'Некрамехи' if f.get('type') == 'Necramech' else 'Варфреймы',
                    'mr': f.get('masteryReq'), 'method': method, 'parts': parts, 'materials': mats,
                    'img': f.get('imageName'), 'vaulted': bool(f.get('vaulted')), 'uid': f['uniqueName'],
                    'cap': f.get('maxLevelCap') or 30, 'xpk': 1000,
                    'source': f.get('wikiaUrl') or 'https://wiki.warframe.com/w/' + name.replace(' ', '_')})
    return out


def main():
    html = open(os.path.join(ROOT, 'source.html'), encoding='utf-8').read()
    m = re.search(r'<script id="data" type="application/json">(.*?)</script>', html, re.S)
    D = json.loads(m.group(1))
    g = re.search(r'const guide=`(.*?)`;', html, re.S)
    D['guide'] = g.group(1) if g else ''
    ov = json.load(open(os.path.join(ROOT, 'overrides.json'), encoding='utf-8'))

    items, relics = [], []
    for c in CATS:
        (relics if c == 'Relics' else items).extend(fetch_json(c))
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
        if n.endswith(' claws'):
            base = n[:-6]
            for p in pets:
                if p['name'].lower() == base or p['name'].lower().startswith(base + ' '):
                    return p
        if n + ' mk i' in byname: return byname[n + ' mk i']
        if n.endswith(' amp'): return byname.get(n[:-4] + ' prism')
        return None

    need, extra = set(), {}
    weapons = [w for w in D['weapons'] if w['category'] not in FRAMECATS]
    for w in weapons:
        it = find(w['name'])
        w['img'] = it['imageName'] if it else None
        if not it and w['name'] in ov['images']:
            w['img'] = 'x-' + re.sub(r'\W+', '', w['name']) + '.png'
            extra[w['img']] = ov['images'][w['name']]
        w['vaulted'] = bool(it and it.get('vaulted'))
        if it:
            w['uid'] = it['uniqueName']
            w['cap'] = it.get('maxLevelCap') or 30
            w['xpk'] = 1000 if it.get('category') in ('Pets', 'Sentinels', 'Archwing') else 500
        for mat in w['materials']:
            r = byname.get((mat.get('en') or '').lower())
            mat['img'] = r['imageName'] if r else None
        for k in ('type',): w.pop(k, None)
        for p in w['parts']: p.pop('uid', None)
        for mat in w['materials']: mat.pop('uid', None)
    for r in D['resources']:
        it = byname.get(r['name'].lower())
        r['img'] = it['imageName'] if it else None

    rel = {}
    for r in relics:
        nm = re.sub(r'\s+(Intact|Exceptional|Flawless|Radiant)$', '', r['name'])
        if r.get('imageName'): rel.setdefault(nm.lower(), r)
    for r in D['relics']:
        it = rel.get(r['name'].lower())
        r['img'] = it['imageName'] if it else None
        r['vaulted'] = it.get('vaulted') if it else None

    ru = fetch_json('i18n/ru')
    comps = {c['uniqueName']: c for c in fetch_json('Components')}
    byuid = {it['uniqueName']: it for it in items}
    frames = build_frames(items, ru, comps, byuid, {k: v.get('vaulted') for k, v in rel.items()}, ov['frames'])

    known = {w['name'].lower() for w in weapons}
    fresh = []
    for it in items:
        if it.get('category') in ('Primary', 'Secondary', 'Melee', 'Arch-Gun', 'Arch-Melee') \
           and it.get('masterable') and it.get('imageName') and it['name'].lower() not in known and it.get('releaseDate'):
            fresh.append({'name': it['name'], 'ru': (ru.get(it['uniqueName']) or {}).get('name') or it['name'],
                          'type': it.get('type') or it['category'], 'mr': it.get('masteryReq'), 'img': it['imageName'],
                          'date': it.get('releaseDate'), 'wiki': it.get('wikiaUrl') or '', 'uid': it['uniqueName']})
    fresh.sort(key=lambda x: x['date'], reverse=True)

    counts = {}
    for w in weapons: counts[w['category']] = counts.get(w['category'], 0) + 1
    out = {'built': datetime.date.today().isoformat(), 'weapons': weapons, 'frames': frames,
           'relics': D['relics'], 'resources': D['resources'], 'fresh': fresh[:60],
           'cats': sorted(counts, key=lambda c: -counts[c]), 'guide': D['guide']}

    for coll in (weapons, frames, D['resources'], D['relics'], fresh):
        for x in coll:
            if x.get('img'): need.add(x['img'])
            for mat in x.get('materials', []):
                if mat.get('img'): need.add(mat['img'])

    imgdir = os.path.join(OUT, 'img')
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    os.makedirs(imgdir)
    os.makedirs(os.path.join(CACHE, 'img'), exist_ok=True)

    def thumb(name):
        safe = re.sub(r'[^\w.-]', '_', name)
        p = os.path.join(CACHE, 'img', safe + '.webp')
        if not os.path.exists(p):
            try:
                im = Image.open(io.BytesIO(get(extra.get(name) or IMG + name))).convert('RGBA')
                im.thumbnail((SIZE, SIZE), Image.LANCZOS)
                im.save(p, 'WEBP', quality=80, method=6)
            except Exception as e:
                print('! картинка', name, e); return name, None
        shutil.copy(p, os.path.join(imgdir, safe + '.webp'))
        return name, safe + '.webp'

    with ThreadPoolExecutor(16) as ex:
        files = dict(ex.map(thumb, sorted(need)))

    def fix(x):
        if 'img' in x: x['img'] = files.get(x['img']) if x['img'] else None
        for mat in x.get('materials', []): mat['img'] = files.get(mat['img']) if mat.get('img') else None
    for coll in (weapons, frames, D['resources'], D['relics'], fresh):
        for x in coll: fix(x)

    json.dump(out, open(os.path.join(OUT, 'data.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    shutil.copy(os.path.join(ROOT, 'app.html'), os.path.join(OUT, 'index.html'))
    shutil.copy(os.path.join(ROOT, 'lore.js'), os.path.join(OUT, 'lore.js'))
    open(os.path.join(OUT, '.nojekyll'), 'w').close()

    miss = [w['name'] for w in weapons + frames if not w.get('img')]
    print(f'оружие: {len(weapons)}, варфреймы: {len(frames)}, реликвии: {len(D["relics"])}, ресурсы: {len(D["resources"])}')
    print(f'иконок: {sum(1 for v in files.values() if v)}, без картинки: {miss}, новинок: {len(fresh)}')
    gaps = [(f['name'], p['name']) for f in frames for p in f['parts'] if 'смотрите вики' in p['where'] or 'подробности на вики' in p['where']]
    print(f'пробелы в варфреймах: {gaps}')


if __name__ == '__main__':
    main()
