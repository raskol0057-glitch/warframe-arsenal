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


def clean(s):
    s = re.sub(r'<[^>]+>', '', str(s or ''))
    return re.sub(r'\|[A-Z_0-9]+\|', 'X', s).replace('\\n', '\n').strip()


def last_stats(ls):
    if isinstance(ls, list) and ls: return [clean(x) for x in ls[-1].get('stats', [])]
    if isinstance(ls, dict): return [clean(x) for x in ls.get('stats', [])]
    return []


def body_stats(f, ru):
    st = {'hp': f.get('health'), 'sh': f.get('shield'), 'ar': f.get('armor'), 'en': f.get('power'),
          'sp': f.get('sprintSpeed'), 'pol': f.get('polarities') or [], 'aura': f.get('aura'), 'exi': f.get('exilusPolarity')}
    st = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in st.items() if v not in (None, [])}
    r = ru.get(f['uniqueName']) or {}
    if r.get('passiveDescription') or f.get('passiveDescription'):
        st['passive'] = clean(r.get('passiveDescription') or f.get('passiveDescription'))
    rab = {a.get('abilityUniqueName'): a for a in r.get('abilities') or []}
    st['ab'] = [{'n': (rab.get(a['uniqueName']) or {}).get('abilityName') or a['name'],
                 'd': clean((rab.get(a['uniqueName']) or {}).get('description') or a.get('description')),
                 'img': a.get('imageName')} for a in f.get('abilities') or []]
    if not st['ab']: del st['ab']
    return st


def companion_cat(f):
    n = f['name']
    if 'Kavat' in n or n.startswith('Venari'): return 'Каваты'
    if 'Kubrow' in n or 'Charger' in n: return 'Кубрау'
    if 'Predasite' in n: return 'Хищники'
    if 'Vulpaphyla' in n: return 'Вульпафилы'
    if f.get('category') == 'Sentinels': return 'Стражи'
    return 'Компаньоны'


def build_frames(items, ru, comps, byuid, relic_vault, ov, catfn=None):
    out = []
    for f in items:
        if not f.get('masterable'):
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
            method = ('Prime-версия: чертёж и детали выпадают из реликвий Бездны. ' +
                      ('Часть реликвий сейчас выпадает.' if live_any else
                       'Сейчас в хранилище: только сохранённые реликвии, обмен с игроками или Prime Resurgence у Варзии.'))
        else:
            bits = []
            if o.get('bp'): bits.append('Чертёж: ' + o['bp'].rstrip('.'))
            src = o.get('parts') or next((p['where'][len('Выпадает: '):].split(' — ')[0] for p in parts
                                           if p['where'].startswith('Выпадает: ') and p['name'] != 'Чертёж'), '')
            if src: bits.append('Детали: ' + src.rstrip('.'))
            method = '. '.join(bits) + '.' if bits else 'Подробности получения — в строках ниже и на вики.'
        if not parts and not o.get('method'):
            method = clean((ru.get(f['uniqueName']) or {}).get('description') or f.get('description')) or method
        cat = catfn(f) if catfn else ('Некрамехи' if f.get('type') == 'Necramech' else 'Варфреймы')
        out.append({'name': name, 'ru': (ru.get(f['uniqueName']) or {}).get('name') or name,
                    'category': cat, 'mr': f.get('masteryReq'), 'method': method, 'parts': parts, 'materials': mats,
                    'img': f.get('imageName'), 'vaulted': bool(f.get('vaulted')), 'uid': f['uniqueName'],
                    'cap': f.get('maxLevelCap') or 30, 'xpk': 1000, 'st': body_stats(f, ru),
                    'bk': 'necramech' if f.get('type') == 'Necramech' else ('companion' if catfn else 'frame'),
                    'source': f.get('wikiaUrl') or 'https://wiki.warframe.com/w/' + name.replace(' ', '_')})
    return out


def weapon_stats(it):
    dmg = {k: round(v, 2) for k, v in (it.get('damage') or {}).items() if k != 'total' and v}
    st = {'cc': it.get('criticalChance'), 'cm': it.get('criticalMultiplier'), 'sc': it.get('procChance'),
          'fr': it.get('fireRate'), 'mag': it.get('magazineSize'), 'rl': it.get('reloadTime'), 'ms': it.get('multishot'),
          'dmg': dmg, 'tot': it.get('totalDamage'), 'disp': it.get('disposition'), 'trig': it.get('trigger'),
          'rng': it.get('range'), 'heavy': it.get('heavyAttackDamage'), 'pol': it.get('polarities') or [],
          'exi': it.get('exilusPolarity'), 'stp': it.get('stancePolarity'), 'wt': it.get('type')}
    return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in st.items() if v not in (None, [], {})}


def builder_kind(it):
    c, t = it.get('category'), it.get('type')
    if c == 'Primary': return 'shotgun' if t == 'Shotgun' else 'rifle'
    if c == 'Secondary': return 'pistol'
    if c == 'Melee': return 'melee'
    if c == 'Arch-Gun': return 'archgun'
    if c == 'Arch-Melee': return 'archmelee'
    if c == 'SentinelWeapons':
        return {'Shotgun': 'shotgun', 'Pistol': 'pistol', 'Melee': 'melee'}.get(t, 'rifle')
    return None


MOD_SKIP = ('Focus Way', 'Transmutation Mod', 'Peculiar Mod')


def build_mods(mods_raw, arcanes_raw, ru):
    def drops(x):
        d = sorted(x.get('drops') or [], key=lambda d: -(d.get('chance') or 0))
        seen, out = set(), []
        for e in d:
            if e['location'] in seen: continue
            c = e.get('chance') or 0
            seen.add(e['location']); out.append([e['location'], round(c * 100 if c <= 1 else c, 2)])
            if len(out) == 3: break
        return out
    best = {}
    for m in mods_raw:
        t = m.get('type') or ''
        if t in MOD_SKIP or 'Riven' in t or 'Riven' in m['name'] or m.get('baseDrain') is None: continue
        if 'Beginner' in m['uniqueName'] or 'Flawed' in m['name']: continue
        if ' ' not in m['name'] and m['name'][1:].islower() and m['name'].lower().endswith('upgrade'): continue
        k = (m['name'], t)
        # Под одним именем бывают служебные версии (…Expert) с другими значениями — берём обычную, с источниками выпадения
        score = (0 if 'Expert' in m['uniqueName'].rsplit('/', 1)[-1] and not m['name'].startswith('Primed') else 1,
                 1 if m.get('drops') else 0, m.get('fusionLimit') or 0)
        if k not in best or score > best[k][0]: best[k] = (score, m)
    best = {k: v[1] for k, v in best.items()}
    mods = []
    for m in best.values():
        r = ru.get(m['uniqueName']) or {}
        en = last_stats(m.get('levelStats'))
        if not en and m.get('description'): en = [clean(m['description'])]
        mods.append({'n': m['name'], 'ru': r.get('name') or m['name'], 't': m.get('type'), 'c': m.get('compatName'),
                     'p': m.get('polarity'), 'r': m.get('rarity'), 'd': m.get('baseDrain'), 'f': m.get('fusionLimit') or 0,
                     'en': en, 'rs': last_stats(r.get('levelStats')) or en, 'img': m.get('imageName'),
                     'aug': bool(m.get('isAugment')), 'exi': bool(m.get('isExilus') or m.get('isUtility')),
                     'set': m.get('modSet', '').rsplit('/', 1)[-1] if m.get('modSet') else None, 'dr': drops(m)})
    mods.sort(key=lambda x: x['ru'])
    arc = []
    for a in arcanes_raw:
        if not a.get('levelStats'): continue
        r = ru.get(a['uniqueName']) or {}
        ls = a['levelStats'] if isinstance(a['levelStats'], list) else [a['levelStats']]
        arc.append({'n': a['name'], 'ru': r.get('name') or a['name'], 't': a.get('type'), 'r': a.get('rarity'),
                    'f': max(len(ls) - 1, 0), 'en': last_stats(a['levelStats']),
                    'rs': last_stats(r.get('levelStats')) or last_stats(a['levelStats']),
                    'img': a.get('imageName'), 'dr': drops(a)})
    arc.sort(key=lambda x: x['ru'])
    focus, seenf = [], {}
    school = {'Attack': 'madurai', 'Defense': 'vazarin', 'Tactic': 'naramon', 'Ward': 'unairu', 'Power': 'zenurik'}
    for m in mods_raw:
        if m.get('type') != 'Focus Way': continue
        p = m['uniqueName'].split('/')
        e = {'s': school.get(p[4], p[4]), 'k': p[5], 'n': m['name'], 'en': ' '.join(last_stats(m.get('levelStats')))}
        key = (e['s'], e['n'])
        if key in seenf and len(seenf[key]['en']) >= len(e['en']): continue
        seenf[key] = e
    focus = sorted(seenf.values(), key=lambda e: (e['s'], ['Ultimate', 'Active', 'Residual', 'Stats'].index(e['k']) if e['k'] in ('Ultimate', 'Active', 'Residual', 'Stats') else 9, e['n']))
    return mods, arc, focus


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
            st = weapon_stats(it)
            if st.get('tot') or st.get('dmg'): w['st'] = st
            bk = builder_kind(it)
            if bk: w['bk'] = bk
            w['rel'] = it.get('releaseDate')
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
    vault = {k: v.get('vaulted') for k, v in rel.items()}
    frames = build_frames([i for i in items if i.get('category') == 'Warframes'], ru, comps, byuid, vault, ov['frames'])
    for f, it in zip(frames, [i for i in items if i.get('category') == 'Warframes' and i.get('masterable')]):
        f['rel'] = it.get('releaseDate')
    pets_src = [i for i in items if (i.get('category') == 'Pets' and i.get('type') in ('Pets', 'Warframe')) or i.get('category') == 'Sentinels']
    companions = build_frames(pets_src, ru, comps, byuid, vault, {}, catfn=companion_cat)

    # Новое в игре: последние добавленные предметы каталога по дате выхода
    fresh = []
    for kind, coll in (('arsenal', weapons), ('frames', frames)):
        for x in coll:
            if x.get('rel'): fresh.append({'k': kind, 'name': x['name'], 'date': x['rel']})
    fresh.sort(key=lambda x: x['date'], reverse=True)

    mods, arcanes, focus = build_mods(fetch_json('Mods'), fetch_json('Arcanes'), ru)
    modru = {m['n']: m['ru'] for m in mods}
    fmods = {}
    for e in fetch_json('Enemy'):
        t = e.get('type')
        if t not in ('Grineer', 'Corpus', 'Infestation', 'Orokin', 'Sentient'): continue
        for d in e.get('drops') or []:
            if d.get('type') == 'Mod Locations' and d['location'] in modru:
                fmods.setdefault(t, {}).setdefault(d['location'], 0)
                fmods[t][d['location']] += 1
    faction_mods = {t: [[modru[n], n] for n, _ in sorted(c.items(), key=lambda x: -x[1])[:14]] for t, c in fmods.items()}

    counts = {}
    for w in weapons: counts[w['category']] = counts.get(w['category'], 0) + 1
    out = {'built': datetime.date.today().isoformat(), 'weapons': weapons, 'frames': frames, 'companions': companions,
           'relics': D['relics'], 'resources': D['resources'], 'fresh': fresh[:48], 'factionMods': faction_mods,
           'cats': sorted(counts, key=lambda c: -counts[c]), 'guide': D['guide']}
    mout = {'mods': mods, 'arcanes': arcanes, 'focus': focus}

    for coll in (weapons, frames, companions, D['resources'], D['relics'], mods, arcanes):
        for x in coll:
            if x.get('img'): need.add(x['img'])
            for mat in x.get('materials', []):
                if mat.get('img'): need.add(mat['img'])
            for a in (x.get('st') or {}).get('ab', []):
                if a.get('img'): need.add(a['img'])

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
        for a in (x.get('st') or {}).get('ab', []): a['img'] = files.get(a['img']) if a.get('img') else None
    for coll in (weapons, frames, companions, D['resources'], D['relics'], mods, arcanes):
        for x in coll: fix(x)

    def dump(o, n):  # единое написание названий по всему сайту
        t = json.dumps(o, ensure_ascii=False, separators=(',', ':'))
        for x, y in (('Грайнир', 'Гренир'), ('Гринир', 'Гренир'), ('Зарьман', 'Зариман')): t = t.replace(x, y)
        open(os.path.join(OUT, n), 'w', encoding='utf-8').write(t)
    dump(out, 'data.json'); dump(mout, 'mods.json')
    shutil.copy(os.path.join(ROOT, 'app.html'), os.path.join(OUT, 'index.html'))
    for f in ('app.js', 'content.js', 'lore.js', 'config.js'):
        shutil.copy(os.path.join(ROOT, f), os.path.join(OUT, f))
    open(os.path.join(OUT, '.nojekyll'), 'w').close()

    miss = [w['name'] for w in weapons + frames + companions if not w.get('img')]
    print(f'оружие: {len(weapons)}, варфреймы: {len(frames)}, компаньоны: {len(companions)}, реликвии: {len(D["relics"])}, ресурсы: {len(D["resources"])}')
    print(f'моды: {len(mods)}, мистификаторы: {len(arcanes)}, фокус: {len(focus)}, фракции с модами: {list(faction_mods)}')
    print(f'иконок: {sum(1 for v in files.values() if v)}, без картинки: {miss}')
    gaps = [(f['name'], p['name']) for f in frames for p in f['parts'] if 'смотрите вики' in p['where'] or 'подробности на вики' in p['where']]
    print(f'пробелы в варфреймах: {gaps}')


if __name__ == '__main__':
    main()
