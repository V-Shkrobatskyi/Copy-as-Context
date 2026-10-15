// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { captureDomPage } from '../src/adapters/dom/capture';

/** Executed in the isolated world only for an explicit capture request. */
export default defineUnlistedScript({
  include: ['firefox'],
  main() { return captureDomPage(document); },
});
