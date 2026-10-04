import glob,os
from PIL import Image
import numpy as np
res=[]
for f in glob.glob('render/png/*.png'):
    im=np.asarray(Image.open(f).convert('RGB')).astype(int)
    h,w,_=im.shape
    bg=im[h//2,w-3] if True else None
    # per-row: is row uniform-ish across the content area (exclude left 240px sidebar for wide)
    x0=240 if w>1000 else 0
    sub=im[:,x0:w]
    # background colour = most common colour
    flat=sub.reshape(-1,3); vals,cnt=np.unique(flat,axis=0,return_counts=True); bgc=vals[cnt.argmax()]
    rowempty=(np.abs(sub-bgc).sum(axis=2)<12).mean(axis=1)>0.985
    best=run=0
    for e in rowempty:
        run=run+1 if e else 0; best=max(best,run)
    res.append((best/h,os.path.basename(f)[:-4]))
res.sort(reverse=True)
for r,n in res[:25]: print(f'{r:.2f} {n}')
