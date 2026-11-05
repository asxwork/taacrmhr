// Patched minimatch 11 that also works the minimatch 3 way (callable default export), so old dev tools
// (@eslint/eslintrc, eslint-plugin-import) and new code share one safe version. Each export is assigned
// on its own line so Node can see the names when this is imported from ES modules.
const m = require("minimatch-v11");
function minimatch(path, pattern, options) { return m.minimatch(path, pattern, options); }
module.exports = minimatch;
module.exports.minimatch = minimatch;
module.exports.sep = m.sep;
module.exports.GLOBSTAR = m.GLOBSTAR;
module.exports.filter = m.filter;
module.exports.defaults = m.defaults;
module.exports.braceExpand = m.braceExpand;
module.exports.match = m.match;
module.exports.Minimatch = m.Minimatch;
module.exports.escape = m.escape;
module.exports.unescape = m.unescape;
module.exports.default = minimatch;
