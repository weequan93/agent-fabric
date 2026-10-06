import {spawnSync} from 'node:child_process';
// Approved read-only system inventory only. Strict known-host verification; no secret reads.
const command="set -eu; uname -srm; printf 'docker-version\\n'; docker version --format '{{.Server.Version}}'; printf 'cgroup-filesystem\\n'; stat -fc %T /sys/fs/cgroup; printf 'cpu-memory\\n'; getconf _NPROCESSORS_ONLN; awk '/MemTotal:/ {print $0}' /proc/meminfo";
const result=spawnSync('ssh',['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=8','-o','ConnectionAttempts=1','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','-p','34819','-i','/Users/super/.ssh/MBP.pem','root@217.216.75.50',command],{encoding:'utf8',timeout:25000,maxBuffer:1024*1024});
if(result.error||result.status!==0){process.stderr.write(result.stderr??'');throw result.error??new Error('Read-only remote probe failed with exit '+result.status);}
console.log(JSON.stringify({measurement:'remote-readonly-system-smoke',host:'217.216.75.50:34819',observed:result.stdout.trim(),readOnly:true,workerIsolationQualified:false,productionQualified:false}));
