import {registerDeliveryOperationsTests} from './helpers/delivery-operations-component.js';
import {registerDeliveryEvidenceTests} from './helpers/delivery-evidence-component.js';
await registerDeliveryOperationsTests(undefined,undefined,'delivery-audit');
await registerDeliveryEvidenceTests();
