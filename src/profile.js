const { load } = require("js-yaml");
const { Validator } = require("jsonschema");
const { getLogger } = require("log4js");
const { getEnv } = require("./environment");

const logger = getLogger("PROFILE");

const profileSchema = {
  type: "object",
  properties: {
    baseUrl: { type: "string" },
    realm: { type: "string" },
    clientRoleOwn: { type: "string" },
    grant: {
      type: "object",
      properties: {
        client_id: { type: "string" },
      },
    },
  },
  required: ["grant", "baseUrl", "realm"],
};

function loadValue(value) {
  const envRegex = /^<env\:\:([_0-9A-Za-z]+)>$/;
  const compiled = envRegex.exec(value);
  if (compiled) {
    return getEnv(compiled[1]);
  }
  return value;
}

function loadObject(obj) {
  Object.keys(obj).forEach((key) => {
    if (typeof obj[key] === "string") {
      obj[key] = loadValue(obj[key]);
    } else {
      obj[key] = loadObject(obj[key]);
    }
  });
  return obj;
}

exports.loadProfiles = (profileInfo) => {
  const validator = new Validator();
  const validationResult = validator.validate(profileInfo, profileSchema);
  if (!validationResult.valid) {
    validationResult.errors.forEach((e) => {
      logger.error(`Profile ${e.message}`);
    });
  }
  loadObject(profileInfo);
  return profileInfo;
};
