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
import json, socket, ipaddress, urllib.error, urllib.request, threading, time

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
def search_web(q):
    if not q or len(q)>250:raise ValueError('Invalid search query')
    url='https://www.bing.com/search?'+urlencode({'q':q,'format':'rss'})
    raw,_=retrieve(url,220000)
    root=ET.fromstring(raw)
    results=[]
    for el in root.findall('.//item')[:7]:
        title=el.findtext('title') or ''
        link=el.findtext('link') or ''
        description=el.findtext('description') or ''
        if link.startswith('https://'):
            results.append({'title':title[:180],'url':link[:700],'text':description[:600]})
    return results
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
            if path=='/atlas/search':return self.reply(200,{'results':search_web(qs.get('q',[''])[0])})
            if path=='/atlas/read':
                url=qs.get('url',[''])[0]
                html,final=retrieve(url)
                extractor=Extractor();extractor.feed(html)
                text=' '.join(extractor.parts)[:14000]
                return self.reply(200,{'title':extractor.title[:180],'url':final,'text':text})
            if path=='/atlas/status':return self.reply(200,{'bridge':'atlas-v2','webSearch':'bing-rss','webRead':True})
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
            data=r.read(400000)
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
