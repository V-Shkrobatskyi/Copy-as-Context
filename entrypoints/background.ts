export default defineBackground(() => {
  // Capture orchestration will be added in stage 2. Keep browser integration
  // at this entrypoint/adapter boundary; the semantic core is browser-agnostic.
});
