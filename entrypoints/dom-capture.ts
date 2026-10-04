import { captureDomPage } from '../src/adapters/dom/capture';

/** Executed in the isolated world only for an explicit capture request. */
export default defineUnlistedScript({
  include: ['firefox'],
  main() { return captureDomPage(document); },
});
