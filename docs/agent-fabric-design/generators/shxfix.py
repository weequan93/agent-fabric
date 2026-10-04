import glob
P='../project/'
R='.shx a[class]:where(.li,.row,.card,.col,.kv,.opt,.tr,.ctl,.nv,.rb,.tabi),.shy a[class]:where(.li,.row,.card,.col,.kv,.opt,.tr,.ctl,.nv,.rb,.tabi){color:inherit}\n'
n=0
for f in glob.glob(P+'*.dc.html'):
    s=open(f).read()
    if ('class="shx"' in s or 'class="shy"' in s) and R not in s:
        s=s.replace('</style>',R+'</style>',1); open(f,'w').write(s); n+=1
print(n)
