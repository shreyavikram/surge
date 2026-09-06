#!/usr/bin/env python3
"""Convert the APHIS dashboard export (UTF-16, tab-separated) into data/snapshots/aphis-detections.csv."""
import csv, os, sys
src = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
raw = open(src, 'rb').read()
enc = 'utf-16' if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else 'utf-8-sig'
rows = list(csv.DictReader(open(src, encoding=enc), delimiter='\t'))
def birds(v):
    v = v.strip()
    if v.endswith('M'): return int(round(float(v[:-1]) * 1e6))
    if v.endswith('K'): return int(round(float(v[:-1]) * 1e3))
    try: return int(float(v.replace(',', '')))
    except ValueError: return 0
out = sorted(({'date': r['Confirmed Diagnosis'].strip(), 'state': r['State'].strip(), 'county': r['County Name'].strip(),
               'production': r['Production'].strip(), 'birds': birds(r['Birds Affected'])} for r in rows), key=lambda x: x['date'])
dst = os.path.join(ROOT, 'data/snapshots/aphis-detections.csv')
with open(dst, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['date', 'state', 'county', 'production', 'birds']); w.writeheader(); w.writerows(out)
print('wrote', len(out), 'rows to', dst, 'range', out[0]['date'], 'to', out[-1]['date'])
