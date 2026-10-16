import {egressCases} from './helpers/egress-cases.js';
import {registerCases} from './helpers/register-cases.js';
registerCases(egressCases,['egress-state','destination-observer','independent-clients']);
