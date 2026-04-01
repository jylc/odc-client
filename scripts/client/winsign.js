exports.default = async function(configuration) {
    // do not include passwords or other sensitive data in the file
    // rather create environment variables with sensitive data
    const CONFIG_FILE = process.env.WINDOWS_SIGN_CONFIG_FILE;

    // Skip signing if smctl is not available (local dev builds)
    const { execSync } = require("child_process");
    try {
      execSync("where smctl", { stdio: "pipe" });
    } catch {
      console.log(`[winsign] Skipping signing - smctl not found: ${configuration.path}`);
      return;
    }

    // Skip signing if config file is not set
    if (!CONFIG_FILE) {
      console.log(`[winsign] Skipping signing - WINDOWS_SIGN_CONFIG_FILE not set: ${configuration.path}`);
      return;
    }

    execSync(
      `smctl sign --keypair-alias key_1318155498 --config-file ${CONFIG_FILE} --input "${configuration.path}" -v`,
      {
        stdio: "inherit"
      }
    );
  };
