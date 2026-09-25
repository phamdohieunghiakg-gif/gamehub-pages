from pathlib import Path
import json, html, re, shutil
from xml.sax.saxutils import escape as xml_escape

ROOT=Path(__file__).resolve().parents[1]
BASE_URL='https://phamdohieunghiakg-gif.github.io/gamehub-pages'
START='<!-- SEO_META_START -->'
END='<!-- SEO_META_END -->'

def compact(s): return re.sub(r'\s+',' ',str(s or '')).strip()
def e(s): return html.escape(str(s),quote=True)
def desc_for(g):
    s=compact(g.get('summary')) or ('Thông tin, hình ảnh và link tải '+compact(g.get('title') or 'game')+' tại GameHub.')
    return s if len(s)<=160 else s[:157].rstrip()+'...'
def abs_url(value):
    s=compact(value)
    if not s: return BASE_URL+'/assets/gamehub-background.png'
    if s.startswith('http://') or s.startswith('https://'): return s
    return BASE_URL+'/'+s.lstrip('/')
def replace_block(template,block):
    a=template.find(START); b=template.find(END)
    if a<0 or b<0 or b<a: raise RuntimeError('index.html thiếu SEO markers')
    return template[:a]+block+template[b+len(END):]
def seo_block_for_game(g):
    title=compact(g.get('title')) or 'Game'; full=title+' | GameHub Việt Hóa'; desc=desc_for(g); slug=compact(g.get('slug'))
    canonical=BASE_URL+'/game/'+slug+'/'; image=abs_url(g.get('cover')); info=g.get('info') or {}
    schema={'@context':'https://schema.org','@type':'VideoGame','name':title,'url':canonical,'description':desc,'image':image,'inLanguage':'vi-VN','contentRating':'18+','isFamilyFriendly':False,'genre':[compact(x) for x in (g.get('genres') or []) if compact(x)],'gamePlatform':compact(info.get('nenTang')) or 'PC','author':{'@type':'Organization','name':'GameHub','url':BASE_URL+'/'}}
    dev=compact(info.get('developer'))
    if dev: schema['publisher']={'@type':'Organization','name':dev}
    js=json.dumps(schema,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
    lines=[START,'<title>'+e(full)+'</title>','<meta name="description" content="'+e(desc)+'">','<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">','<link rel="canonical" href="'+e(canonical)+'">','<meta property="og:locale" content="vi_VN">','<meta property="og:type" content="article">','<meta property="og:site_name" content="GameHub">','<meta property="og:title" content="'+e(full)+'">','<meta property="og:description" content="'+e(desc)+'">','<meta property="og:url" content="'+e(canonical)+'">','<meta property="og:image" content="'+e(image)+'">','<meta name="twitter:card" content="summary_large_image">','<meta name="twitter:title" content="'+e(full)+'">','<meta name="twitter:description" content="'+e(desc)+'">','<meta name="twitter:image" content="'+e(image)+'">','<script type="application/ld+json">'+js+'</script>',END]
    return '\n'.join(lines)
def seo_block_for_route(title,desc,canonical,indexable):
    robots='index,follow,max-image-preview:large' if indexable else 'noindex,nofollow'
    return '\n'.join([START,'<title>'+e(title)+'</title>','<meta name="description" content="'+e(desc)+'">','<meta name="robots" content="'+robots+'">','<link rel="canonical" href="'+e(canonical)+'">','<meta property="og:locale" content="vi_VN">','<meta property="og:type" content="website">','<meta property="og:site_name" content="GameHub">','<meta property="og:title" content="'+e(title)+'">','<meta property="og:description" content="'+e(desc)+'">','<meta property="og:url" content="'+e(canonical)+'">',END])
def main():
    template=(ROOT/'index.html').read_text(encoding='utf-8'); games=json.loads((ROOT/'data/games.json').read_text(encoding='utf-8'))
    game_root=ROOT/'game'
    if game_root.exists(): shutil.rmtree(game_root)
    game_root.mkdir()
    urls=[(BASE_URL+'/',None,'1.0'),(BASE_URL+'/donate/',None,'0.4')]
    for g in games:
        slug=compact(g.get('slug'))
        if not slug: continue
        out=game_root/slug; out.mkdir(parents=True,exist_ok=True)
        (out/'index.html').write_text(replace_block(template,seo_block_for_game(g)),encoding='utf-8')
        last=compact(g.get('updatedAt') or g.get('createdAt'))[:10] or None
        urls.append((BASE_URL+'/game/'+slug+'/',last,'0.8'))
    admin=ROOT/'admin'; admin.mkdir(exist_ok=True)
    (admin/'index.html').write_text(replace_block(template,seo_block_for_route('Quản trị GameHub','Trang quản trị GameHub.',BASE_URL+'/admin/',False)),encoding='utf-8')
    donate=ROOT/'donate'; donate.mkdir(exist_ok=True)
    (donate/'index.html').write_text(replace_block(template,seo_block_for_route('Ủng hộ GameHub','Trang ủng hộ cộng đồng GameHub.',BASE_URL+'/donate/',True)),encoding='utf-8')
    lines=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc,last,priority in urls:
        lines+=['  <url>','    <loc>'+xml_escape(loc)+'</loc>']
        if last: lines.append('    <lastmod>'+xml_escape(last)+'</lastmod>')
        lines+=['    <priority>'+priority+'</priority>','  </url>']
    lines.append('</urlset>')
    (ROOT/'sitemap.xml').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    (ROOT/'robots.txt').write_text('User-agent: *\nAllow: /\nDisallow: /gamehub-pages/admin/\nSitemap: '+BASE_URL+'/sitemap.xml\n',encoding='utf-8')
    print('Generated',len(games),'SEO game pages')
if __name__=='__main__': main()
