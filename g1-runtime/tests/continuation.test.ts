import {continuationCases} from './helpers/continuation-cases.js';
import {settlementCases} from './helpers/settlement-cases.js';
import {settlementQuiescencePilotCases} from './helpers/settlement-quiescence-cases.js';
import {registerCases} from './helpers/register-cases.js';
registerCases({...continuationCases,...settlementCases,...settlementQuiescencePilotCases},['continuation-state','target-observer','process-census']);
