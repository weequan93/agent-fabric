import {toolCases} from './helpers/tool-cases.js';
import {browserEgressToolCases} from './helpers/egress-cases.js';
import {registerCases} from './helpers/register-cases.js';
registerCases({...toolCases,...browserEgressToolCases},['tool-state','target-observer','worker-census']);
