function executableName(value) {
  return value?.split(/[\\/]/).at(-1)?.toLowerCase();
}

export function npmInvocation({
  commandInterpreter = process.env.ComSpec ?? "cmd.exe",
  npmExecPath = process.env.npm_execpath,
  nodeExecutable = process.execPath,
  platform = process.platform,
} = {}) {
  if (executableName(npmExecPath) === "npm-cli.js") {
    return {
      command: nodeExecutable,
      arguments: [npmExecPath],
    };
  }
  if (platform === "win32") {
    return {
      command: commandInterpreter,
      arguments: ["/d", "/s", "/c", "npm.cmd"],
    };
  }
  return {
    command: "npm",
    arguments: [],
  };
}
