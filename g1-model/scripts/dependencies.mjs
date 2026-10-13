import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd, postgresImage } from './paths.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function assertDependencyMetadata() {
 const data = JSON.parse(readFileSync(resolve(cwd, 'dependencies.json'), 'utf8'));
 if (data.observedAt !== '2026-10-07' || data.node !== '22.22.3' || data.packageManager !== 'pnpm@10.18.0'
  || !data.maintenance?.procedure?.includes('No automatic updates') || data.maintenance.securityAssessment !== 'independent security reviewer'
  || !data.runtimeImage.componentLicenses.startsWith('unknown;')) throw new Error('Dated dependency status/update responsibility mismatch');
 if (data.schemaVersion !== 1 || data.dependencies.length !== 18 || data.runtimeImage.reference !== postgresImage
  || data.runtimeImage.downloadAllowed !== false || sha(readFileSync(resolve(cwd, 'pnpm-lock.yaml'))) !== data.lockSha256) throw new Error('Independent dependency metadata mismatch');
 for (const dependency of data.dependencies) {
  if (!dependency.installedPath.startsWith('node_modules/.pnpm/') || dependency.installedPath.split('/').includes('..')) throw new Error('Invalid dependency metadata path');
  const pkgBytes = readFileSync(resolve(cwd, dependency.installedPath, 'package.json'));
  const pkg = JSON.parse(pkgBytes);
  if (dependency.securityStatus !== 'unknown; no vulnerability scan or independent assessment claimed' || typeof dependency.declaredLicense !== 'string'
   || !['available installed files retained byte-for-byte', 'no license/notice file present in installed package; declaration only; completeness pending independent review'].includes(dependency.noticeStatus)) throw new Error('Unsupported dependency clearance/status claim');
  if (pkg.name !== dependency.name || pkg.version !== dependency.version || sha(pkgBytes) !== dependency.packageJsonSha256
   || JSON.stringify(pkg.license ?? 'unknown') !== JSON.stringify(dependency.declaredLicense) || dependency.localPatches.length !== 0) throw new Error('Installed dependency metadata changed: ' + dependency.name);
  for (const notice of dependency.notices) {
   if (!notice.path.startsWith('notices/') || notice.path.split('/').includes('..') || notice.installedName.includes('/')) throw new Error('Invalid notice path');
   if (sha(readFileSync(resolve(cwd, notice.path))) !== notice.sha256
    || sha(readFileSync(resolve(cwd, dependency.installedPath, notice.installedName))) !== notice.sha256) throw new Error('Dependency notice changed: ' + dependency.name);
  }
 }
 console.log(JSON.stringify({ measurement: 'dependency-metadata', dependencies: data.dependencies.length, notices: data.dependencies.reduce((n, d) => n + d.notices.length, 0), securityAssessment: 'unknown', missingInstalledNotices: data.dependencies.filter(d => !d.notices.length).map(d => d.name) }));
}
