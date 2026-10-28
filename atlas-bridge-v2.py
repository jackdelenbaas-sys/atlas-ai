#!/usr/bin/env python3
"""Atlas private local bridge. Python 3.9+, no external packages.
Tailscale Serve should point HTTPS to http://127.0.0.1:11435.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.client import HTTPConnection
from urllib.parse import urlparse, parse_qs, urlencode, urljoin, unquote
from urllib.request import Request, build_opener, HTTPRedirectHandler
from html.parser import HTMLParser
from xml.etree import ElementTree as ET
import json, socket, ipaddress, urllib.error, urllib.request, threading, time, os, re, concurrent.futures

ORIGIN = "https://jackdelenbaas-sys.github.io"
MAX_BODY = 120000
class Extractor(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[];self.hidden=0;self.title='';self.in_title=False
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','nav','footer','header','noscript'): self.hidden+=1
        if tag=='title':self.in_title=True
    def handle_endtag(self,tag):
        if tag in ('script','style','nav','footer','header','noscript'):self.hidden=max(0,self.hidden-1)
        if tag=='title':self.in_title=False
    def handle_data(self,data):
        if self.in_title:self.title+=data
        elif not self.hidden and data.strip():self.parts.append(data.strip())

def public_url(url):
    p=urlparse(url)
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.port not in (None,443):
        raise ValueError('Only public HTTPS websites are supported')
    hostname=p.hostname.lower().rstrip('.')
    if hostname in ('localhost','host.docker.internal') or hostname.endswith(('.local','.internal','.localhost','.ts.net')):
        raise ValueError('Private addresses are not allowed')
    try:
        addrs=socket.getaddrinfo(hostname,443,type=socket.SOCK_STREAM)
        if not addrs or any(not ipaddress.ip_address(a[4][0]).is_global for a in addrs):
            raise ValueError('Non-public address blocked')
    except socket.gaierror:raise ValueError('Website hostname could not be resolved')
    return url

class CheckedRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        public_url(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)
opener=build_opener(CheckedRedirect)
def retrieve(url,limit=300000):
    public_url(url)
    req=Request(url,headers={'User-Agent':'AtlasPersonalResearch/1.0 (personal reading assistant)','Accept':'text/html,application/rss+xml,application/xml,text/plain;q=0.8'})
    with opener.open(req,timeout=9) as r:
        ctype=r.headers.get('Content-Type','')
        if not any(x in ctype for x in ('html','text/','xml','rss','json')):raise ValueError('Unsupported content type')
        final=r.geturl(); public_url(final)
        return r.read(limit).decode('utf-8',errors='replace'),final
def brave_key():
    try:
        with open(os.path.expanduser('~/.atlas-brave-key')) as file: return file.read().strip()
    except OSError: return ''

def brave_search(q,kind='web'):
    key=brave_key()
    if not key: raise ValueError('Brave API key not configured')
    route={'web':'web/search','images':'images/search','news':'news/search'}[kind]
    url='https://api.search.brave.com/res/v1/'+route+'?'+urlencode({'q':q[:250],'count':8})
    req=Request(url,headers={'X-Subscription-Token':key,'Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=12) as r: data=json.load(r)
    arr=data.get(kind,{}).get('results',[])
    return [{'title':str(x.get('title',''))[:180],'url':str(x.get('url') or x.get('page_url') or '')[:700],
             'text':str(x.get('description') or x.get('snippet') or '')[:700],
             'image': (x.get('properties') or {}).get('url') or (x.get('thumbnail') or {}).get('src') or ''} for x in arr]

class DDGParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.results=[];self.link=None;self.text=[];self.snippet=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='a' and ('result__a' in a.get('class','') or 'result-link' in a.get('class','')):
            self.link=a.get('href','');self.text=[]
    def handle_data(self,data):
        if self.link is not None:self.text.append(data.strip())
    def handle_endtag(self,tag):
        if tag=='a' and self.link is not None:
            raw=self.link; p=urlparse(raw)
            if 'uddg' in parse_qs(p.query):raw=parse_qs(p.query)['uddg'][0]
            if raw.startswith('//'):raw='https:'+raw
            if raw.startswith('https://') and len(self.results)<9:
                title=' '.join(x for x in self.text if x).strip()
                if title:self.results.append({'title':title[:180],'url':raw[:700],'text':''})
            self.link=None;self.text=[]

class OpenGraphParser(HTMLParser):
    def __init__(self):super().__init__();self.image=''
    def handle_starttag(self,tag,attrs):
        if tag!='meta':return
        a=dict(attrs)
        if a.get('property') in ('og:image','og:image:secure_url') and a.get('content','').startswith('https://'):
            self.image=a['content']

def search_ddg(q):
    html,_=retrieve('https://html.duckduckgo.com/html/?'+urlencode({'q':q}),280000)
    parser=DDGParser();parser.feed(html)
    return parser.results[:7]

def google_news(q):
    url='https://news.google.com/rss/search?'+urlencode({'q':q,'hl':'en-US','gl':'US','ceid':'US:en'})
    raw,_=retrieve(url,220000)
    root=ET.fromstring(raw)
    hits=[]
    for item in root.findall('.//item')[:8]:
        link=(item.findtext('link') or '')
        if not link.startswith('https://'):continue
        title=(item.findtext('title') or '')
        description=re.sub(r'<[^>]+>',' ',(item.findtext('description') or ''))
        published=(item.findtext('pubDate') or '')
        hits.append({'title':title[:180],'url':link[:700],'text':description[:500],'published':published[:80]})
    return hits

def commons_images(q):
    url='https://commons.wikimedia.org/w/api.php?'+urlencode({'action':'query','generator':'search','gsrsearch':q,'gsrnamespace':'6','gsrlimit':'8','prop':'imageinfo','iiprop':'url|mime','iiurlwidth':'400','format':'json'})
    raw,_=retrieve(url,250000)
    data=json.loads(raw)
    pages=list(data.get('query',{}).get('pages',{}).values())
    results=[]
    for p in sorted(pages,key=lambda p:p.get('index',99)):
        info=(p.get('imageinfo') or [{}])[0]
        img=info.get('thumburl') or info.get('url') or ''
        mime=info.get('mime','')
        if img.startswith('https://') and mime.startswith('image/') and mime!='image/svg+xml':
            results.append({'title':p.get('title','').replace('File:','')[:180],'url':info.get('descriptionurl','') or info.get('url',''),
                'image':img,'text':'Image from Wikimedia Commons (check the source page for license)'})
    return results

def relevant_results(query, results):
    # Reject search-engine substitutions (e.g., "what's" -> WhatsApp).
    stop={'what','whats','when','where','which','with','from','latest','news','about','tell','give','show','search','find','please','current','recent','research','multiple','articles','explain','developments','confirmed','information','speculation','the','and','for','are','how','does','new','full'}
    tokens=[w for w in re.findall(r"[a-z0-9]+",query.lower()) if len(w)>=4 and w not in stop]
    if not tokens:return results
    core=tokens[:5]
    matches=[]
    for hit in results:
        hay=(' '+str(hit.get('title',''))+' '+str(hit.get('text',''))+' '+str(hit.get('url',''))).lower()
        count=sum(bool(re.search(r'(?<![a-z0-9])'+re.escape(token)+r'(?![a-z0-9])',hay)) for token in core)
        if count>=min(2,len(core)) or (len(core)==1 and count>=1):
            matches.append(hit)
    return matches

def search_web(q,kind='web'):
    if not q or len(q)>250:raise ValueError('Invalid search query')
    key=brave_key()
    if key:
        try:
            result=brave_search(q,kind)
            result=relevant_results(q,result)
            if result:return {'results':result,'provider':'brave','configured':True}
        except Exception as error:
            print('Brave search unavailable:',str(error)[:150],flush=True)
    errors=[]
    if kind=='images':
        try:
            images=commons_images(q)
            images=relevant_results(q,images)
            if images:return {'results':images,'provider':'wikimedia-commons','configured':False}
            errors.append('Wikimedia Commons had no matching images')
        except Exception as e:errors.append('Wikimedia Commons: '+str(e)[:130])
    if kind=='news':
        try:
            hits=google_news(q)
            hits=relevant_results(q,hits)
            if hits:return {'results':hits,'provider':'google-news-rss','configured':False}
            errors.append('Google News returned no items')
        except Exception as e:errors.append('Google News: '+str(e)[:110])
    query=q if kind!='images' else q+' photos pictures'
    if kind=='news':query=q+' latest news'
    try:
        results=relevant_results(q,search_ddg(query))
        if results:
            if kind=='images':
                images=[]
                for item in results[:5]:
                    try:
                        html,_=retrieve(item['url'],140000)
                        meta=OpenGraphParser();meta.feed(html)
                        if meta.image:
                            item['image']=meta.image;images.append(item)
                    except Exception:pass
                if images:return {'results':images,'provider':'ddg-page-images','configured':False}
            else:
                return {'results':results,'provider':'duckduckgo-html','configured':False}
        errors.append('DuckDuckGo returned no usable results')
    except Exception as e:errors.append('DuckDuckGo: '+str(e)[:130])
    if kind=='images':return {'results':[],'provider':'duckduckgo-html','configured':False,'error':'No accessible website images found. '+('; '.join(errors))}
    try:
        url='https://www.bing.com/search?'+urlencode({'q':query,'format':'rss'})
        raw,_=retrieve(url,220000)
        root=ET.fromstring(raw)
        results=[]
        for el in root.findall('.//item')[:8]:
            link=el.findtext('link') or ''
            if link.startswith('https://'):
                results.append({'title':(el.findtext('title') or '')[:180],'url':link[:700],
                                'text':(el.findtext('description') or '')[:600]})
        results=relevant_results(q,results)
        if results:return {'results':results,'provider':'bing-rss','configured':False}
        errors.append('Bing RSS returned no results')
    except Exception as e:errors.append('Bing RSS: '+str(e)[:130])
    return {'results':[],'provider':'free-search','configured':False,'error':'No on-topic results found. '+('; '.join(errors))}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,fmt,*args): pass
    def cors(self):
        self.send_header('Access-Control-Allow-Origin',ORIGIN)
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
        self.send_header('Vary','Origin')
        self.send_header('Cache-Control','no-store')
    def reply(self,status,obj):
        body=json.dumps(obj,ensure_ascii=False).encode()
        self.send_response(status);self.cors()
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)));self.end_headers()
        try:self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError):pass
    def permitted(self):
        origin=self.headers.get('Origin')
        if origin and origin!=ORIGIN:
            self.reply(403,{'error':'Disallowed origin'});return False
        return True
    def do_OPTIONS(self):
        if not self.permitted():return
        self.send_response(204);self.cors();self.end_headers()
    def do_GET(self):
        if not self.permitted():return
        path=urlparse(self.path).path
        try:
            qs=parse_qs(urlparse(self.path).query)
            if path=='/atlas/search':return self.reply(200,search_web(qs.get('q',[''])[0],qs.get('type',['web'])[0] if qs.get('type',['web'])[0] in ('web','images','news') else 'web'))
            if path=='/atlas/read':
                url=qs.get('url',[''])[0]
                html,final=retrieve(url)
                extractor=Extractor();extractor.feed(html)
                text=' '.join(extractor.parts)[:14000]
                return self.reply(200,{'title':extractor.title[:180],'url':final,'text':text})
            if path=='/atlas/status':return self.reply(200,{'bridge':'atlas-v9','webSearch':'Brave' if brave_key() else 'DuckDuckGo/Bing RSS','news':'Google News RSS','images':'Brave' if brave_key() else 'Wikimedia Commons + page metadata','webRead':True})
            if path=='/atlas/diagnostics':
                def run_test(item):
                    name,query,kind=item
                    try:
                        outcome=search_web(query,kind)
                        return name,{'provider':outcome.get('provider'),'count':len(outcome.get('results',[])),'titles':[v.get('title','')[:110] for v in outcome.get('results',[])[:3]],'error':outcome.get('error','')}
                    except Exception as err:return name,{'provider':'error','count':0,'error':str(err)[:150]}
                checks=[('web','Zeeland Michigan','web'),('news','Tesla','news'),('tesla_fsd','Tesla unsupervised full self driving','news'),('images','Alps mountain landscape','images')]
                with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                    tests=dict(pool.map(run_test,checks))
                return self.reply(200,{'bridge':'atlas-v7','tests':tests})
            if path=='/api/tags':return self.forward()
            return self.reply(404,{'error':'Unknown endpoint'})
        except Exception as e:return self.reply(502,{'error':str(e)[:250]})
    def do_POST(self):
        if not self.permitted():return
        if urlparse(self.path).path!='/api/chat':return self.reply(404,{'error':'Unknown endpoint'})
        return self.forward()
    def forward(self):
        if urlparse(self.path).path not in ('/api/tags','/api/chat'):
            return self.reply(404,{'error':'Unknown endpoint'})
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<0 or n>MAX_BODY:return self.reply(413,{'error':'Request too large'})
            body=self.rfile.read(n) if n else None
            conn=HTTPConnection('127.0.0.1',11434,timeout=180)
            conn.request(self.command,urlparse(self.path).path,body=body,headers={'Host':'localhost:11434','Content-Type':'application/json'})
            r=conn.getresponse()
            data=r.read(2_000_000)
            if r.length is not None and r.length>2_000_000:
                conn.close();return self.reply(502,{'error':'Ollama response exceeded safe limit'})
            self.send_response(r.status);self.cors()
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(data)))
            self.end_headers();self.wfile.write(data);conn.close()
        except Exception as e:
            try:self.reply(502,{'error':str(e)[:250]})
            except Exception:pass

if __name__=='__main__':
    print('Atlas research bridge ready on 127.0.0.1:11435',flush=True)
    ThreadingHTTPServer(('127.0.0.1',11435),Handler).serve_forever()
