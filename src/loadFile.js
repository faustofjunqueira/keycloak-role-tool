const fs = require('fs');
const yaml = require('js-yaml');

exports.loadFile = (pathFile) => {
  let fileContents = fs.readFileSync(pathFile, 'utf8');
  return yaml.safeLoad(fileContents);
}
