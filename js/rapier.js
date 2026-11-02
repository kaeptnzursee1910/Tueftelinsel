// Physik-Bibliothek Rapier (WebAssembly) einmal laden und überall als R nutzen
import RAPIER from '../lib/rapier.es.js';

export let R = null;
export async function initPhysics() {
  await RAPIER.init();
  R = RAPIER;
  return R;
}
