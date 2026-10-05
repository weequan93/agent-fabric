'use strict';
const { app, BrowserWindow, Menu, session }=require('electron');
const { join }=require('node:path');
const { mkdirSync }=require('node:fs');
const { WEB_ORIGIN, desktopPreferences, installSecurity }=require('./security.cjs');
const cache=join(__dirname,'node_modules','.cache','electron-local');
for(const name of ['user-data','session-data','logs','crash-dumps'])mkdirSync(join(cache,name),{recursive:true});
app.setPath('userData',join(cache,'user-data'));
app.setPath('sessionData',join(cache,'session-data'));
app.setPath('crashDumps',join(cache,'crash-dumps'));
app.setAppLogsPath(join(cache,'logs'));
app.enableSandbox();
let window=null;
async function createWindow(){
  const localSession=session.fromPartition('agent-fabric-g1-local-desktop',{cache:false});
  window=new BrowserWindow({width:1260,height:920,minWidth:760,minHeight:640,title:'Agent Fabric · Local test',backgroundColor:'#F3F5F8',webPreferences:{...desktopPreferences(),session:localSession,preload:join(__dirname,'preload.cjs')}});
  installSecurity({window,session:localSession});
  window.on('closed',()=>{window=null;});
  window.webContents.on('did-fail-load',(_event,code,_description,url,isMainFrame)=>{if(isMainFrame)console.error(JSON.stringify({event:'local-web-unavailable',code,url:url===WEB_ORIGIN+'/'?url:'redacted',nextAction:'Start the accepted loopback Web server on 127.0.0.1:5173 and restart this client.'}));});
  window.webContents.once('did-finish-load',()=>console.log(JSON.stringify({event:'local-desktop-loaded',surface:'electron',electron:process.versions.electron,webOrigin:WEB_ORIGIN,identityMode:'local-test',modelMode:'deterministic-test',effectMode:'synthetic-only',paidCallsAllowed:false,remoteAllowed:false,privilegedIPC:false})));
  await window.loadURL(WEB_ORIGIN+'/');
}
app.whenReady().then(async()=>{Menu.setApplicationMenu(null);await createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow().catch(()=>console.error('Local Web is unavailable.'));});}).catch(()=>console.error('Unable to load the accepted local Web. Start 127.0.0.1:5173 and restart the desktop.'));
app.on('window-all-closed',()=>app.quit());
