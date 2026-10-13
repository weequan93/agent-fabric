import {suites} from './manifest.mjs';

// Fixed Q04/Q07 diagnostic; the full S-Q imports the same assertion bodies.
export const verifyAskDisclosureComponent=Object.freeze({file:'components/verify-ask-disclosure.component.test.js',
 cases:['Q04','Q07'],integration:true,positives:['save','ask','forget','read','write','deny','owner'],
 variants:{Q04:suites['recall-ask'].variants.Q04,Q07:suites['recall-ask'].variants.Q07}});
