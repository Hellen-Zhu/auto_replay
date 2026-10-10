// What the modules of the runner share and change while the window is open. It is one object, so that every module
// sees the value another one has just set.

module.exports = {
  // Nothing typed is echoed: a hidden prompt, the case tree, a case that is running
  muted: false,
  // While the case is running on a real console, typed keys are not echoed (they would garble the step log)
  quietKeys: false,
  // Set once the input has ended (piped input used up, console closed): nothing more can be asked
  inputEnded: false,
  // The number of runs that are under way. Ctrl+C means "stop the run" only then; at a prompt it closes the window
  openRuns: 0,
  // Set while a batch runs, so that Ctrl+C can still write its summary
  activeBatch: null,
  // A run of this window failed: the exit code, however the window is closed
  sessionFailed: false,
  // A session is being recorded: Ctrl+C ends the session instead of closing the window
  recording: false,
};
