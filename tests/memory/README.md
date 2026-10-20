# Memory retention checks

Run `npm run test:memory` separately or as part of `npm run check`. No additional
dependencies or extension runtime code are needed. The dedicated Vitest config
starts a Node fork with `--expose-gc`; regular `npm test` remains unchanged.

The tests hold the debugger client and capturer alive across repeated captures.
Fresh main/child AX snapshots, individual raw nodes, semantic nodes and children,
export result objects, and event listener functions are tracked with `WeakRef`.
After the caller releases its result, bounded GC attempts across separate event
loop turns must collect them. An intentionally retained object must stay alive
until its strong reference is removed, so the detector has a positive control.

Covered outcomes: success, partial child failure, root navigation after snapshots,
cleanup failure, and a command timeout followed by late callback delivery. Tests
also assert listener removal, debugger detach and reuse of the same tab. The mock
keeps no payload or callback call history; spies could create artificial leaks.

This is a regression gate for specific JavaScript object lifetimes. It does not
use a flaky heap-size threshold, measure peak RAM, check every internal temporary
object, or detect native Chrome/CDP/DOM memory leaks. Objects legitimately owned
by a pending browser callback are checked after that callback is delivered and
released. Existing opt-in allocation benchmarks remain in `tests/performance`.

Firefox coordinator coverage also checks fresh frame envelopes, local and merged
semantic nodes, exports, tab listeners and repeated use of the same coordinator.
Scenarios include success, denied child access, main document change and a
capture timeout followed by late delivery. Each caller invocation returns before
GC checks, so the test itself does not retain its last result in an async frame.
The content helper separately has a structural lease TTL; DOM lifetime and
Android process termination still require browser/device checks.

The picker suite keeps jsdom source documents alive while checking that detached
selection nodes and channel listeners are collected after cancel, disconnect,
completion and failure. It uses coordinate selection without focusing the target
to avoid jsdom's own retained focus-event targets. This tests picker cleanup, not
native browser DOM lifetimes or service-worker process memory.
