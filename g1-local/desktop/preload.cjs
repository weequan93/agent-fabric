'use strict';
const { contextBridge }=require('electron');
// Values only: no ipcRenderer, token, filesystem, credential or command capability.
const localProfile=Object.freeze({schemaVersion:1,surface:'electron',identityMode:'local-test',modelMode:'deterministic-test',effectMode:'synthetic-only',paidCallsAllowed:false,remoteAllowed:false,productionSSOQualified:false,signedDistributionQualified:false});
contextBridge.exposeInMainWorld('agentFabricLocalProfile',localProfile);
