'use strict';
const WEB_ORIGIN='http://127.0.0.1:5173';
const API_ORIGIN='http://127.0.0.1:8791';
const CSP_POLICY="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src http://127.0.0.1:8791 ws://127.0.0.1:5173; img-src 'self' data:; font-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
function parsedLocal(value,origin,prefix) {
  if(typeof value!=='string'||value.length>8192||/[\u0000-\u0020\u007f\\]/.test(value)||!prefix.test(value))return false;
  try{const url=new URL(value);return url.origin===origin&&url.username===''&&url.password==='';}catch{return false;}
}
function allowedNavigation(value){return parsedLocal(value,WEB_ORIGIN,/^http:\/\/127\.0\.0\.1:5173(?:[/?#]|$)/);}
function resourceAllowed(value){return allowedNavigation(value)||parsedLocal(value,API_ORIGIN,/^http:\/\/127\.0\.0\.1:8791(?:[/?#]|$)/)||parsedLocal(value,'ws://127.0.0.1:5173',/^ws:\/\/127\.0\.0\.1:5173(?:[/?#]|$)/);}
function desktopPreferences(){return Object.freeze({nodeIntegration:false,nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,allowRunningInsecureContent:false,experimentalFeatures:false,spellcheck:false});}
function permissionAllowed(){return false;}
function installSecurity({window,session}) {
  if(!window?.webContents||!session)throw Error('A real desktop window and session are required.');
  const contents=window.webContents;
  // Electron 44 exposes navigation URL on the event; old positional URL is
  // accepted only as a compatibility fallback for older supported event APIs.
  const preventExternal=(event,url)=>{if(!allowedNavigation(event.url??url))event.preventDefault();};
  contents.on('will-navigate',preventExternal);
  contents.on('will-redirect',preventExternal);
  contents.on('will-frame-navigate',preventExternal);
  contents.on('will-attach-webview',event=>event.preventDefault());
  contents.setWindowOpenHandler(()=>({action:'deny'}));
  session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(permissionAllowed()));
  session.setPermissionCheckHandler(()=>permissionAllowed());
  session.on('will-download',event=>event.preventDefault());
  if(session.webRequest?.onBeforeRequest)session.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>callback({cancel:!resourceAllowed(details.url)}));
  if(session.webRequest?.onHeadersReceived)session.webRequest.onHeadersReceived({urls:[WEB_ORIGIN+'/*']},(details,callback)=>{
    const headers={};for(const [key,value]of Object.entries(details.responseHeaders??{}))if(key.toLowerCase()!=='content-security-policy')headers[key]=value;
    headers['Content-Security-Policy']=[CSP_POLICY];headers['X-Content-Type-Options']=['nosniff'];
    callback({responseHeaders:headers});
  });
  return Object.freeze({webOrigin:WEB_ORIGIN,apiOrigin:API_ORIGIN,permissions:'deny',privilegedIPC:false});
}
module.exports={WEB_ORIGIN,API_ORIGIN,CSP_POLICY,desktopPreferences,allowedNavigation,resourceAllowed,permissionAllowed,installSecurity};
