#!/usr/bin/env python3
"""Atlas Cloud Bridge: private localhost-only OpenAI API gateway. Python 3.9+."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from pathlib import Path
import json, re, time, os, io, base64, zipfile
from xml.etree import ElementTree as ET
ORIGIN="https://jackdelenbaas-sys.github.io"
HOME=Path.home()
KEY_FILE=HOME/".atlas-openai-key"
MODEL_FILE=HOME/".atlas-model"
MAX_BODY=15*1024*1024
def key():
    v=os.environ.get("OPENAI_API_KEY","").strip()
    if v:return v
    try:return KEY_FILE.read_text().strip()
    except OSError:return ""
def model():
    try:return MODEL_FILE.read_text().strip() or "gpt-6-luna"
    except OSError:return "gpt-6-luna"
def request_api(path,data=None,method=None,timeout=110,raw=False):
    token=key()
    if not token:raise ValueError("No OpenAI API key configured. Add one in the Atlas setup on your Mac.")
    body=None if data is None else json.dumps(data).encode("utf-8")
    req=Request("https://api.openai.com/v1/"+path.lstrip("/"),data=body,
                method=method or ("POST" if body is not None else "GET"),
                headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
    try:
        with urlopen(req,timeout=timeout) as r:
            res=r.read(22*1024*1024 if raw else 12*1024*1024)
            return res if raw else json.loads(res)
    except HTTPError as e:
        try:
            problem=json.loads(e.read(4096)).get("error",{})
            msg=problem.get("message") or str(e)
        except Exception:msg=str(e)
        raise ValueError("OpenAI API "+str(e.code)+": "+str(msg)[:300])
def extract_response(data):
    chunks=[];images=[];links=[];seen=set()
    for item in data.get("output",[]):
        if item.get("type")=="image_generation_call" and item.get("result"):
            images.append("data:image/png;base64,"+item["result"])
        if item.get("type")=="message":
            for part in item.get("content",[]):
                if part.get("type")=="output_text":
                    chunks.append(part.get("text",""))
                    for a in part.get("annotations",[]):
                        if a.get("type")=="url_citation":
                            u=a.get("url")
                            if u and u not in seen:
                                seen.add(u);links.append({"title":a.get("title") or "Source","url":u})
    return {"text":"\n".join(chunks).strip(),"images":images[:3],"sources":links[:8]}
PERSONA=("You are Atlas, a lively personal AI with a classy 3D human avatar. "
"You are genuinely helpful, accurate and current. Default to SHORT concise answers: usually 2-5 sentences, unless detail is needed. "
"Personality: witty, playful, mildly sassy, occasionally theatrical; never mean, never repetitive, never force jokes. "
"Be smart, confident when evidence supports it, and admit uncertainty. "
"Use live web search for questions about current information, events, recommendations, prices and facts that may change. "
"Use trustworthy sources and be clear about recency. Never pretend to have researched when you have not. "
"Use conversation context and user memory. Analyze attached images and files carefully. "
"To control your avatar, optionally finish a response with exactly one tag from "
"<atlas_action>wave</atlas_action>, <atlas_action>dance</atlas_action>, <atlas_action>point</atlas_action>, "
"<atlas_action>think</atlas_action>, <atlas_action>greet</atlas_action>, <atlas_action>idle</atlas_action>. "
"Choose a fitting action occasionally, especially when the user asks to move. "
"These tags are instructions to the Atlas avatar and must never appear in the spoken answer.")
def office_text(data,limit=20000):
    try:
        _,encoded=data.split(",",1)
        raw=base64.b64decode(encoded,validate=True)
        if len(raw)>10*1024*1024:return "[Office attachment exceeds 10MB]"
        parts=[]
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            files=[f for f in archive.namelist() if
                   f=="word/document.xml" or f=="xl/sharedStrings.xml" or
                   re.fullmatch(r"xl/worksheets/sheet[0-9]+\.xml",f) or
                   re.fullmatch(r"ppt/slides/slide[0-9]+\.xml",f)]
            for name in files[:35]:
                data_bytes=archive.read(name)
                root=ET.fromstring(data_bytes)
                for e in root.iter():
                    if e.tag.split("}")[-1] in ("t","v") and e.text:
                        parts.append(e.text.strip())
                if sum(len(x) for x in parts)>limit:break
        return " ".join(parts)[:limit] or "[No readable text found in Office document]"
    except Exception as e:return "[Could not read Office document: "+str(e)[:100]+"]"

def clean_input(payload):
    history=payload.get("history",[])
    if not isinstance(history,list):history=[]
    messages=[]
    for m in history[-36:]:
        if not isinstance(m,dict) or m.get("role") not in ("user","assistant"):continue
        content=str(m.get("text",""))[:4500]
        if content:messages.append({"role":m["role"],"content":content})
    text=str(payload.get("text","")).strip()[:7500]
    parts=[{"type":"input_text","text":text or "Describe the attached content."}]
    at=payload.get("attachments",[])
    if isinstance(at,list):
        for a in at[:8]:
            if not isinstance(a,dict):continue
            mime=str(a.get("type",""))
            name=str(a.get("name","file"))[:150]
            content=str(a.get("data",""))
            if mime.startswith("image/") and content.startswith("data:image/"):
                parts.append({"type":"input_image","image_url":content})
            elif mime=="application/pdf" and content.startswith("data:application/pdf;base64,"):
                parts.append({"type":"input_file","filename":name,"file_data":content})
            elif "openxmlformats-officedocument" in mime or name.lower().endswith((".docx",".pptx",".xlsx")):
                parts.append({"type":"input_text","text":"Office attachment "+name+":\n"+office_text(content)})
            elif mime.startswith("text/"):
                parts.append({"type":"input_text","text":"Attachment "+name+":\n"+str(a.get("text",""))[:16000]})
            elif mime.startswith("video/"):
                for frame in a.get("frames",[])[:4]:
                    if isinstance(frame,str) and frame.startswith("data:image/"):
                        parts.append({"type":"input_image","image_url":frame})
                parts.append({"type":"input_text","text":"The video "+name+" was represented by sampled frames. Do not claim full video/audio analysis."})
    messages.append({"role":"user","content":parts})
    return messages
class Handler(BaseHTTPRequestHandler):
    def log_message(self,fmt,*args):pass
    def headers_common(self):
        self.send_header("Access-Control-Allow-Origin",ORIGIN)
        self.send_header("Vary","Origin")
        self.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
    def reply(self,status,obj):
        body=json.dumps(obj,ensure_ascii=False).encode("utf-8")
        self.send_response(status);self.headers_common()
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(body)));self.end_headers()
        try:self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError):pass
    def permitted(self):
        origin=self.headers.get("Origin")
        if origin and origin!=ORIGIN:
            self.reply(403,{"error":"Origin is not authorized"});return False
        return True
    def do_OPTIONS(self):
        if not self.permitted():return
        self.send_response(204);self.headers_common();self.end_headers()
    def do_GET(self):
        if not self.permitted():return
        p=urlparse(self.path).path
        if p=="/atlas/api/status":
            return self.reply(200,{"bridge":"atlas-cloud-v2","configured":bool(key()),"model":model(),"web":True,"images":True,"video":"account-dependent"})
        if p=="/atlas/api/diagnose":
            try:
                result=request_api("responses",{"model":model(),"input":"Reply with the single word READY.","max_output_tokens":24,"store":False},timeout=35)
                parsed=extract_response(result)
                return self.reply(200,{"connected":True,"model":model(),"reply":parsed["text"][:90]})
            except Exception as e:return self.reply(502,{"connected":False,"error":str(e)[:320]})
        match=re.fullmatch(r"/atlas/api/video/([a-zA-Z0-9_-]{5,100})(/content)?",p)
        if match:
            try:
                content=bool(match.group(2))
                if content:
                    body=request_api("videos/"+match.group(1)+"/content",raw=True,timeout=100)
                    self.send_response(200);self.headers_common()
                    self.send_header("Content-Type","video/mp4")
                    self.send_header("Content-Length",str(len(body)));self.end_headers();self.wfile.write(body)
                else:self.reply(200,request_api("videos/"+match.group(1),timeout=30))
            except Exception as e:self.reply(502,{"error":str(e)})
            return
        self.reply(404,{"error":"Not found"})
    def do_POST(self):
        if not self.permitted():return
        p=urlparse(self.path).path
        if p not in ("/atlas/api/chat","/atlas/api/image","/atlas/api/video"):
            return self.reply(404,{"error":"Not found"})
        try:
            n=int(self.headers.get("Content-Length","0"))
            if n<1 or n>MAX_BODY:return self.reply(413,{"error":"Attachment too large (15 MB request limit)"})
            data=json.loads(self.rfile.read(n))
            if not isinstance(data,dict):raise ValueError("Invalid request")
            if p=="/atlas/api/video":
                prompt=str(data.get("text","")).strip()[:1800]
                if not prompt:raise ValueError("A video description is required")
                result=request_api("videos",{"model":"sora-2","prompt":prompt,"size":"1280x720","seconds":"4"},timeout=45)
                return self.reply(200,{"id":result.get("id"),"status":result.get("status","queued")})
            mode=p.rsplit("/",1)[1]
            notes=data.get("memories",[])
            memory_text="\n".join(str(v)[:280] for v in notes[-30:]) if isinstance(notes,list) else ""
            messages=clean_input(data)
            now=time.strftime("%A, %B %d, %Y %H:%M %Z")
            chosen=str(data.get("model","gpt-6-luna"))
            if chosen not in ("gpt-6-luna","gpt-6.1-sol"):chosen=model()
            payload={
                "model":chosen,
                "instructions":PERSONA+"\nCurrent server date/time: "+now+"\nUser notes (unverified personal context): "+memory_text,
                "input":messages,
                "store":False,
                "max_output_tokens":1800 if mode=="chat" else 800,
            }
            if mode=="chat":payload["tools"]=[{"type":"web_search"}]
            else:
                payload["tools"]=[{"type":"image_generation","model":"gpt-image-2","quality":"medium"}]
                payload["tool_choice"]={"type":"image_generation"}
            result=request_api("responses",payload,timeout=125 if mode=="chat" else 180)
            response=extract_response(result)
            if not response["text"] and not response["images"]:
                raise ValueError("The model returned no visible text or image")
            self.reply(200,response)
        except Exception as e:self.reply(502,{"error":str(e)[:420]})
if __name__=="__main__":
    print("Atlas Cloud Bridge running at http://127.0.0.1:11435",flush=True)
    ThreadingHTTPServer(("127.0.0.1",11435),Handler).serve_forever()
