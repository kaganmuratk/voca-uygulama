import json,subprocess,sys,os,glob,collections,bisect
out=sys.argv[1]
L=[json.loads(l) for l in open(out+'/log.jsonl') if l.strip()]
W=[x for x in L if x['olay']=='basla'][0]['w']
S=sorted([x for x in L if x['olay']=='snap' and x.get('sr')],key=lambda x:x['ts']); st=[x['ts'] for x in S]
shots=sorted(glob.glob(out+'/shots/*.jpg'))
sz=int(subprocess.run(['ffprobe','-v','error','-show_entries','stream=width','-of','csv=p=0',shots[0]],capture_output=True,text=True).stdout.strip()); sc=sz/W
ts=lambda f:int(os.path.basename(f).split('.')[0])
def sinif(f,sr):
    x,y,w,h=[int(v*sc) for v in sr]
    cx,cy,cw,ch=x+int(w*.1),y+int(h*.1),int(w*.8),int(h*.45)
    r=subprocess.run(['ffmpeg','-v','error','-i',f,'-vf',f'crop={cw}:{ch}:{cx}:{cy},scale=24:24','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    if len(r)<24*24*3: return None
    px=[(r[i],r[i+1],r[i+2]) for i in range(0,len(r),3)]; n=len(px); m=[sum(p[k] for p in px)/n for k in range(3)]
    sd=(sum(sum((p[k]-m[k])**2 for k in range(3)) for p in px)/n/3)**.5; mm=sum(m)/3
    if mm<22 and sd<10: return 'SIYAH'
    if mm>235 and sd<10: return 'BEYAZ'
    return 'icerik'
def snapnear(t):
    i=bisect.bisect_left(st,t); c=[j for j in (i-1,i) if 0<=j<len(S)]
    j=min(c,key=lambda j:abs(st[j]-t)); return (j,S[j]) if abs(st[j]-t)<=260 else (None,None)
res=[]
for f in shots:
    t=ts(f); j,a=snapnear(t)
    if a is None: continue
    ys=[S[k]['sr'][1] for k in range(max(0,j-1),min(len(S),j+2))]
    if max(ys)-min(ys)>3: res.append((t,'kayma',a)); continue
    res.append((t,sinif(f,a['sr']),a))
prev=None; ev=[]
for x in S:
    if x['ai']>=0 and x['ai']!=prev:
        if prev is not None: ev.append((x['ts'],x['asama'],x['ai'],x['pp']))
        prev=x['ai']
print('shots',len(shots),'geçiş',len(ev))
tum=collections.Counter()
for T,asama,ai,pp in ev:
    seg=[c for t,c,_ in res if T-100<=t<=T+2000 and c and c!='kayma']
    tum.update(seg)
    bad=[(t-T,c) for t,c,_ in res if T-100<=t<=T+2000 and c in('SIYAH','BEYAZ')]
    # hazır mıydı: T'den önceki son snap'te komşu (d=+1) hazır?
    onc=[x for x in S if x['ts']<T and x['ai']==ai-1]
    hz=bool(onc and onc[-1]['pp'][2] and onc[-1]['pp'][2].get('hz'))
    ilk=[x for x in S if x['ts']>=T and x['ai']==ai and x['kart']=='oynuyor']
    print(asama,'kart',ai,'| komşu hazırdı:',hz,'| ilk oynuyor +',(ilk[0]['ts']-T) if ilk else None,'ms | örnek',len(seg),dict(collections.Counter(seg)),'| KÖTÜ',bad)
print('TOPLAM',dict(tum))
