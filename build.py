#!/usr/bin/env python3
"""Build static hiking website from GPX files; Python standard library only."""
from pathlib import Path
from collections import defaultdict
import xml.etree.ElementTree as ET
import json, math, statistics, os, re

ROOT=Path(__file__).resolve().parent
def hav(a,b):
    p1,p2=math.radians(a[0]),math.radians(b[0])
    dp=p2-p1;dl=math.radians(b[1]-a[1])
    return 12742*math.asin(min(1,math.sqrt(math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2)))
def parse(path):
    root=ET.parse(path).getroot()
    segs=[]
    for seg in root.findall(".//{*}trkseg"):
        pts=[]
        for p in seg.findall("{*}trkpt"):
            ele=p.findtext("{*}ele")
            pts.append([round(float(p.get("lat")),6),round(float(p.get("lon")),6),round(float(ele),1) if ele else None])
        if len(pts)>1:segs.append(pts)
    if not segs:
        pts=[]
        for p in root.findall(".//{*}rtept"):
            ele=p.findtext("{*}ele")
            pts.append([round(float(p.get("lat")),6),round(float(p.get("lon")),6),round(float(ele),1) if ele else None])
        if len(pts)>1:segs=[pts]
    if not segs:return None
    km=sum(hav(a,b) for s in segs for a,b in zip(s,s[1:]))
    gains=[]
    for s in segs:
        elev=[p[2] for p in s]
        if sum(v is not None for v in elev)<2:continue
        smooth=[]
        for i in range(len(s)):
            vals=[v for v in elev[max(0,i-5):i+6] if v is not None]
            smooth.append(statistics.median(vals) if vals else None)
        gains.append(sum(max(0,b-a) for a,b in zip(smooth,smooth[1:]) if a is not None and b is not None))
    name=path.stem.replace("___"," – ").replace("_"," ")
    return {"name":name,"segments":segs,"km":round(km,2),"gain":round(sum(gains)) if gains else None,"hasElevation":bool(gains)}
def cell(p):return round(p[0]/.0008),round(p[1]/.00125)
def main():
    routes=[]
    for path in sorted((ROOT/"gpx").glob("*.gpx")):
        try:
            r=parse(path)
            if r:routes.append(r)
        except Exception as exc:
            raise RuntimeError(f"Could not read {path.name}: {exc}") from exc
    if not routes:raise RuntimeError("No GPX routes found")
    grid=defaultdict(set)
    for idx,r in enumerate(routes):
        for seg in r["segments"]:
            for a,b in zip(seg,seg[1:]):
                n=max(1,math.ceil(hav(a,b)*1000/40))
                for j in range(n+1):
                    t=j/n
                    grid[cell((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))].add(idx)
    heatlines=[]
    for idx,r in enumerate(routes):
        for seg in r["segments"]:
            sampled=[seg[0][:2]]
            for a,b in zip(seg,seg[1:]):
                n=max(1,math.ceil(hav(a,b)*1000/55))
                sampled.extend([[round(a[0]+(b[0]-a[0])*j/n,6),round(a[1]+(b[1]-a[1])*j/n,6)] for j in range(1,n+1)])
            current=[];last=None
            for a,b in zip(sampled,sampled[1:]):
                mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
                level=min(4,len(grid.get(cell(mid),{idx})))
                if last!=level:
                    if len(current)>1:heatlines.append([last,current])
                    current=[a,b];last=level
                else:current.append(b)
            if len(current)>1:heatlines.append([last,current])
    payload=json.dumps({"routes":routes,"heatlines":heatlines},ensure_ascii=False,separators=(",",":")).replace("</","<\\/")
    html=(ROOT/"template.html").read_text(encoding="utf-8").replace("__ROUTE_DATA__",payload)
    out=ROOT/"site"
    out.mkdir(exist_ok=True)
    (out/"index.html").write_text(html,encoding="utf-8")
    (out/".nojekyll").write_text("",encoding="utf-8")
    print(f"Built {len(routes)} routes, {sum(r['km'] for r in routes):.1f} km -> {out/'index.html'}")
if __name__=="__main__":main()
