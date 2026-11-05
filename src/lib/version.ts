// The app version (package.json), shown on System health. Bumped on every release to main.
import pkg from "../../package.json";
export const APP_VERSION: string = pkg.version;
