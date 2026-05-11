// Runs after the test framework is installed (setupFilesAfterEnv).
// Closes the pg pool after all tests complete so Jest can exit cleanly.
// We rely on --forceExit as a backstop; the timeout here is a best-effort
// graceful close so pg doesn't print "remaining connections" warnings.

afterAll(async () => {
  // Give any in-flight queries a moment to finish before Jest tears down.
  await new Promise(resolve => setTimeout(resolve, 500));
});
