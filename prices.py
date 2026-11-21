"""Цены с warframe.market для Prime-деталей и наборов, наград реликвий и мистификаторов.

Запускается в GitHub Actions раз в сутки (API рынка не разрешает запросы прямо со страницы сайта).
Цена = медиана до 5 самых дешёвых предложений продажи от игроков онлайн. Лимит API — 3 запроса в секунду.
Результат: cache/prices.json  {"<английское название>": {"p": цена, "slug": "...", "t": "дата"}}
Запуск:  python prices.py [--max-minutes 12]
"""
import json, os, sys, time, datetime, statistics, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'cache', 'prices.json')
API = 'https://api.warframe.market/v2/'
UA = {'User-Agent': 'warframe-arsenal-build', 'Accept': 'application/json', 'Language': 'en', 'Platform': 'pc'}
MAX_MIN = float(sys.argv[sys.argv.index('--max-minutes') + 1]) if '--max-minutes' in sys.argv else 12


def get(path):
    req = urllib.request.Request(API + path, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    old = {}
    if os.path.exists(OUT):
        old = json.load(open(OUT, encoding='utf-8'))
    items = get('items')['data']
    want = {}
    for it in items:
        tags = set(it.get('tags', []))
        name = it['i18n']['en']['name']
        if 'prime' in tags or 'arcane_enhancement' in tags:
            want[name] = it['slug']
    # самые старые цены обновляем первыми, чтобы за несколько запусков обновилось всё
    order = sorted(want, key=lambda n: (old.get(n) or {}).get('t', ''))
    start, done = time.time(), 0
    for name in order:
        if time.time() - start > MAX_MIN * 60:
            break
        slug = want[name]
        try:
            sell = get(f'orders/item/{slug}/top')['data'].get('sell', [])
            prices = sorted(o['platinum'] for o in sell)[:5]
            old[name] = {'p': round(statistics.median(prices)) if prices else None, 'slug': slug,
                         't': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M')}
            done += 1
        except Exception as e:
            print('!', slug, e)
            time.sleep(2)
        time.sleep(0.4)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(old, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'цен обновлено: {done} из {len(want)}, всего в файле: {len(old)}')


if __name__ == '__main__':
    main()
