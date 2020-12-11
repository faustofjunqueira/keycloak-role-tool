const package = require("./package.json");
require('dotenv').config()
const { program } = require("commander");
const path = require("path");
const { createRoles } = require("./src/execution");

// TODO: Fazer documentação

// Configure logs
const log4js = require("log4js");
log4js.configure({
  appenders: { output: { type: "stdout" } },
  categories: { default: { appenders: ["output"], level: "ALL" } },
});
const logger = log4js.getLogger("MERGE-TOOLS");

program.version(package.version, "-v, --vers", "output the current version");

program
  .option("-f, --file <file>", "input file in YAML")
  .option("-p, --profile <profile>", "input file in YAML", "default")
  .option("-r, --reset", "reset all registers", false)
  .option("--drop", "drop all registers", false)
  .option("--force-drop", "drop even all registers", false)
  .option("--verbose", "show error detail");

program.parse(process.argv);

(async function () {
  try {
    if (program.file) {
      const pathFile = path.resolve("./", program.file);
      await createRoles(pathFile, program.profile, program.reset, program.drop, program.forceDrop);
    } else {
      throw new ReferenceError("File not found!");
    }
  } catch (e) {
    logger.error(e.message);
    if(program.verbose) {
      logger.error(e.message);
      e.config && console.log(e.config);
      e.baseURL && console.log(e.baseURL);
      console.log(e.stack);
    }
  }
  console.log("\n\n[Ctrl+C] to finish...");
})();
