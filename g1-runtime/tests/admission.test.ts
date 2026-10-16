import {admissionCases} from './helpers/admission-cases.js';
import {planCases} from './helpers/plan-cases.js';
import {registerCases} from './helpers/register-cases.js';
import {continuationAuthorityCases} from './helpers/continuation-cases.js';
registerCases({...admissionCases,...planCases,...continuationAuthorityCases},['admission-state','target-observer','port-census']);
