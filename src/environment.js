
function getEnv(envvar, defaultValue) {

  if(process.env[envvar]) {
    return process.env[envvar];
  }

  if(defaultValue === undefined) {
    throw new ReferenceError(`Environment variable ${envvar} not found.`);
  }

  return defaultValue;
}

exports.getEnv = getEnv;

exports.Environment = {

  get profile() {
    return getEnv("PROFILE", null);
  }
}
