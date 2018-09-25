"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.NoOpLogger = exports.AppUpdater = undefined;

var _bluebirdLst;

function _load_bluebirdLst() {
    return _bluebirdLst = require("bluebird-lst");
}

var _builderUtilRuntime;

function _load_builderUtilRuntime() {
    return _builderUtilRuntime = require("builder-util-runtime");
}

var _crypto;

function _load_crypto() {
    return _crypto = require("crypto");
}

var _electron;

function _load_electron() {
    return _electron = require("electron");
}

var _electronIsDev;

function _load_electronIsDev() {
    return _electronIsDev = _interopRequireDefault(require("electron-is-dev"));
}

var _events;

function _load_events() {
    return _events = require("events");
}

var _fsExtraP;

function _load_fsExtraP() {
    return _fsExtraP = require("fs-extra-p");
}

var _jsYaml;

function _load_jsYaml() {
    return _jsYaml = require("js-yaml");
}

var _lazyVal;

function _load_lazyVal() {
    return _lazyVal = require("lazy-val");
}

var _path = _interopRequireWildcard(require("path"));

var _semver;

function _load_semver() {
    return _semver = require("semver");
}

require("source-map-support/register");

var _electronHttpExecutor;

function _load_electronHttpExecutor() {
    return _electronHttpExecutor = require("./electronHttpExecutor");
}

var _GenericProvider;

function _load_GenericProvider() {
    return _GenericProvider = require("./GenericProvider");
}

var _main;

function _load_main() {
    return _main = require("./main");
}

var _providerFactory;

function _load_providerFactory() {
    return _providerFactory = require("./providerFactory");
}

var _DownloadedUpdateHelper;

function _load_DownloadedUpdateHelper() {
    return _DownloadedUpdateHelper = require("./DownloadedUpdateHelper");
}

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class AppUpdater extends (_events || _load_events()).EventEmitter {
    constructor(options, app) {
        super();
        /**
         * Whether to automatically download an update when it is found.
         */
        this.autoDownload = true;
        /**
         * Whether to automatically install a downloaded update on app quit (if `quitAndInstall` was not called before).
         *
         * Applicable only on Windows and Linux.
         */
        this.autoInstallOnAppQuit = true;
        /**
         * *GitHub provider only.* Whether to allow update to pre-release versions. Defaults to `true` if application version contains prerelease components (e.g. `0.12.1-alpha.1`, here `alpha` is a prerelease component), otherwise `false`.
         *
         * If `true`, downgrade will be allowed (`allowDowngrade` will be set to `true`).
         */
        this.allowPrerelease = false;
        /**
         * *GitHub provider only.* Get all release notes (from current version to latest), not just the latest.
         * @default false
         */
        this.fullChangelog = false;
        /**
         * Whether to allow version downgrade (when a user from the beta channel wants to go back to the stable channel).
         * @default false
         */
        this.allowDowngrade = false;
        this._channel = null;
        /**
         *  The request headers.
         */
        this.requestHeaders = null;
        this._logger = console;
        /**
         * For type safety you can use signals, e.g. `autoUpdater.signals.updateDownloaded(() => {})` instead of `autoUpdater.on('update-available', () => {})`
         */
        this.signals = new (_main || _load_main()).UpdaterSignal(this);
        this._appUpdateConfigPath = null;
        this.updateAvailable = false;
        this.clientPromise = null;
        this.stagingUserIdPromise = new (_lazyVal || _load_lazyVal()).Lazy(() => this.getOrCreateStagingUserId());
        // public, allow to read old config for anyone
        this.configOnDisk = new (_lazyVal || _load_lazyVal()).Lazy(() => this.loadUpdateConfig());
        this.checkForUpdatesPromise = null;
        this.updateInfo = null;
        this.on("error", error => {
            this._logger.error(`Error: ${error.stack || error.message}`);
        });
        if (app != null || global.__test_app != null) {
            this.app = app || global.__test_app;
            this.untilAppReady = Promise.resolve();
            this.httpExecutor = null;
        } else {
            this.app = require("electron").app;
            this.httpExecutor = new (_electronHttpExecutor || _load_electronHttpExecutor()).ElectronHttpExecutor((authInfo, callback) => this.emit("login", authInfo, callback));
            this.untilAppReady = new Promise(resolve => {
                if (this.app.isReady()) {
                    resolve();
                } else {
                    this.app.on("ready", resolve);
                }
            });
        }
        this.downloadedUpdateHelper = new (_DownloadedUpdateHelper || _load_DownloadedUpdateHelper()).DownloadedUpdateHelper(this.app.getPath("userData"));
        const currentVersionString = this.app.getVersion();
        const currentVersion = (0, (_semver || _load_semver()).valid)(currentVersionString);
        if (currentVersion == null) {
            throw (0, (_builderUtilRuntime || _load_builderUtilRuntime()).newError)(`App version is not a valid semver version: "${currentVersionString}`, "ERR_UPDATER_INVALID_VERSION");
        }
        this.currentVersion = currentVersion;
        this.allowPrerelease = hasPrereleaseComponents(this.currentVersion);
        if (options != null) {
            this.setFeedURL(options);
        }
    }
    /**
     * Get the update channel. Not applicable for GitHub. Doesn't return `channel` from the update configuration, only if was previously set.
     */
    get channel() {
        return this._channel;
    }
    /**
     * Set the update channel. Not applicable for GitHub. Overrides `channel` in the update configuration.
     *
     * `allowDowngrade` will be automatically set to `true`. If this behavior is not suitable for you, simple set `allowDowngrade` explicitly after.
     */
    set channel(value) {
        if (this._channel != null) {
            if (typeof value !== "string") {
                throw (0, (_builderUtilRuntime || _load_builderUtilRuntime()).newError)(`Channel must be a string, but got: ${value}`, "ERR_UPDATER_INVALID_CHANNEL");
            } else if (value.length === 0) {
                throw (0, (_builderUtilRuntime || _load_builderUtilRuntime()).newError)(`Channel must be not an empty string`, "ERR_UPDATER_INVALID_CHANNEL");
            }
        }
        this._channel = value;
        this.allowDowngrade = true;
    }
    /**
     * The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`.
     * Set it to `null` if you would like to disable a logging feature.
     */
    get logger() {
        return this._logger;
    }
    set logger(value) {
        this._logger = value == null ? new NoOpLogger() : value;
    }
    // noinspection JSUnusedGlobalSymbols
    /**
     * test only
     * @private
     */
    set updateConfigPath(value) {
        this.clientPromise = null;
        this._appUpdateConfigPath = value;
        this.configOnDisk = new (_lazyVal || _load_lazyVal()).Lazy(() => this.loadUpdateConfig());
    }
    get provider() {
        return this.clientPromise;
    }
    //noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
    getFeedURL() {
        return "Deprecated. Do not use it.";
    }
    /**
     * Configure update provider. If value is `string`, [GenericServerOptions](/configuration/publish.md#genericserveroptions) will be set with value as `url`.
     * @param options If you want to override configuration in the `app-update.yml`.
     */
    setFeedURL(options) {
        // https://github.com/electron-userland/electron-builder/issues/1105
        let provider;
        if (typeof options === "string") {
            provider = new (_GenericProvider || _load_GenericProvider()).GenericProvider({ provider: "generic", url: options }, this);
        } else {
            provider = (0, (_providerFactory || _load_providerFactory()).createClient)(options, this);
        }
        this.clientPromise = Promise.resolve(provider);
    }
    /**
     * Asks the server whether there is an update.
     */
    checkForUpdates() {
        let checkForUpdatesPromise = this.checkForUpdatesPromise;
        if (checkForUpdatesPromise != null) {
            return checkForUpdatesPromise;
        }
        checkForUpdatesPromise = this._checkForUpdates();
        this.checkForUpdatesPromise = checkForUpdatesPromise;
        const nullizePromise = () => this.checkForUpdatesPromise = null;
        checkForUpdatesPromise.then(nullizePromise).catch(nullizePromise);
        return checkForUpdatesPromise;
    }
    checkForUpdatesAndNotify() {
        if ((_electronIsDev || _load_electronIsDev()).default) {
            return Promise.resolve(null);
        }
        this.signals.updateDownloaded(it => {
            new (_electron || _load_electron()).Notification({
                title: "A new update is ready to install",
                body: `${this.app.getName()} version ${it.version} is downloaded and will be automatically installed on exit`
            }).show();
        });
        return this.checkForUpdates();
    }
    isStagingMatch(updateInfo) {
        var _this = this;

        return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function* () {
            const rawStagingPercentage = updateInfo.stagingPercentage;
            let stagingPercentage = rawStagingPercentage;
            if (stagingPercentage == null) {
                return true;
            }
            stagingPercentage = parseInt(stagingPercentage, 10);
            if (isNaN(stagingPercentage)) {
                _this._logger.warn(`Staging percentage is NaN: ${rawStagingPercentage}`);
                return true;
            }
            // convert from user 0-100 to internal 0-1
            stagingPercentage = stagingPercentage / 100;
            const stagingUserId = yield _this.stagingUserIdPromise.value;
            const val = (_builderUtilRuntime || _load_builderUtilRuntime()).UUID.parse(stagingUserId).readUInt32BE(12);
            const percentage = val / 0xFFFFFFFF;
            _this._logger.info(`Staging percentage: ${stagingPercentage}, percentage: ${percentage}, user id: ${stagingUserId}`);
            return percentage < stagingPercentage;
        })();
    }
    _checkForUpdates() {
        var _this2 = this;

        return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function* () {
            try {
                yield _this2.untilAppReady;
                _this2._logger.info("Checking for update");
                _this2.emit("checking-for-update");
                return yield _this2.doCheckForUpdates();
            } catch (e) {
                _this2.emit("error", e, `Cannot check for updates: ${(e.stack || e).toString()}`);
                throw e;
            }
        })();
    }
    computeFinalHeaders(headers) {
        if (this.requestHeaders != null) {
            Object.assign(headers, this.requestHeaders);
        }
        return headers;
    }
    getUpdateInfo() {
        var _this3 = this;

        return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function* () {
            yield _this3.untilAppReady;
            if (_this3.clientPromise == null) {
                _this3.clientPromise = _this3.configOnDisk.value.then(function (it) {
                    return (0, (_providerFactory || _load_providerFactory()).createClient)(it, _this3);
                });
            }
            const client = yield _this3.clientPromise;
            const stagingUserId = yield _this3.stagingUserIdPromise.value;
            client.setRequestHeaders(_this3.computeFinalHeaders({ "X-User-Staging-Id": stagingUserId }));
            return yield client.getLatestVersion();
        })();
    }
    doCheckForUpdates() {
        var _this4 = this;

        return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function* () {
            const updateInfo = yield _this4.getUpdateInfo();
            const latestVersion = (0, (_semver || _load_semver()).valid)(updateInfo.version);
            if (latestVersion == null) {
                throw (0, (_builderUtilRuntime || _load_builderUtilRuntime()).newError)(`Latest version (from update server) is not valid semver version: "${latestVersion}`, "ERR_UPDATER_INVALID_VERSION");
            }
            const isStagingMatch = yield _this4.isStagingMatch(updateInfo);
            if (!isStagingMatch || (_this4.allowDowngrade && !hasPrereleaseComponents(latestVersion) ? (0, (_semver || _load_semver()).eq)(latestVersion, _this4.currentVersion) : !(0, (_semver || _load_semver()).gt)(latestVersion, _this4.currentVersion))) {
                _this4.updateAvailable = false;
                _this4._logger.info(`Update for version ${_this4.currentVersion} is not available (latest version: ${updateInfo.version}, downgrade is ${_this4.allowDowngrade ? "allowed" : "disallowed"}.`);
                _this4.emit("update-not-available", updateInfo);
                return {
                    versionInfo: updateInfo,
                    updateInfo
                };
            }
            _this4.updateAvailable = true;
            _this4.updateInfo = updateInfo;
            _this4.onUpdateAvailable(updateInfo);
            const cancellationToken = new (_builderUtilRuntime || _load_builderUtilRuntime()).CancellationToken();
            //noinspection ES6MissingAwait
            return {
                versionInfo: updateInfo,
                updateInfo,
                cancellationToken,
                downloadPromise: _this4.autoDownload ? _this4.downloadUpdate(cancellationToken) : null
            };
        })();
    }
    onUpdateAvailable(updateInfo) {
        this._logger.info(`Found version ${updateInfo.version} (url: ${(0, (_builderUtilRuntime || _load_builderUtilRuntime()).asArray)(updateInfo.files).map(it => it.url).join(", ")})`);
        this.emit("update-available", updateInfo);
    }
    /**
     * Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.
     * @returns {Promise<string>} Path to downloaded file.
     */
    downloadUpdate(cancellationToken = new (_builderUtilRuntime || _load_builderUtilRuntime()).CancellationToken()) {
        var _this5 = this;

        return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function* () {
            const updateInfo = _this5.updateInfo;
            if (updateInfo == null) {
                const error = new Error("Please check update first");
                _this5.dispatchError(error);
                throw error;
            }
            _this5._logger.info(`Downloading update from ${(0, (_builderUtilRuntime || _load_builderUtilRuntime()).asArray)(updateInfo.files).map(function (it) {
                return it.url;
            }).join(", ")}`);
            try {
                return yield _this5.doDownloadUpdate(updateInfo, cancellationToken);
            } catch (e) {
                _this5.dispatchError(e);
                throw e;
            }
        })();
    }
    dispatchError(e) {
        this.emit("error", e, (e.stack || e).toString());
    }
    loadUpdateConfig() {
        var _this6 = this;

        return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function* () {
            if (_this6._appUpdateConfigPath == null) {
                _this6._appUpdateConfigPath = (_electronIsDev || _load_electronIsDev()).default ? _path.join(_this6.app.getAppPath(), "dev-app-update.yml") : _path.join(process.resourcesPath, "app-update.yml");
            }
            return (0, (_jsYaml || _load_jsYaml()).safeLoad)((yield (0, (_fsExtraP || _load_fsExtraP()).readFile)(_this6._appUpdateConfigPath, "utf-8")));
        })();
    }
    /*** @private */
    computeRequestHeaders() {
        var _this7 = this;

        return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function* () {
            const fileExtraDownloadHeaders = (yield _this7.provider).fileExtraDownloadHeaders;
            if (fileExtraDownloadHeaders != null) {
                const requestHeaders = _this7.requestHeaders;
                return requestHeaders == null ? fileExtraDownloadHeaders : Object.assign({}, fileExtraDownloadHeaders, requestHeaders);
            }
            return _this7.computeFinalHeaders({ Accept: "*/*" });
        })();
    }
    getOrCreateStagingUserId() {
        var _this8 = this;

        return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function* () {
            const file = _path.join(_this8.app.getPath("userData"), ".updaterId");
            try {
                const id = yield (0, (_fsExtraP || _load_fsExtraP()).readFile)(file, "utf-8");
                if ((_builderUtilRuntime || _load_builderUtilRuntime()).UUID.check(id)) {
                    return id;
                } else {
                    _this8._logger.warn(`Staging user id file exists, but content was invalid: ${id}`);
                }
            } catch (e) {
                if (e.code !== "ENOENT") {
                    _this8._logger.warn(`Couldn't read staging user ID, creating a blank one: ${e}`);
                }
            }
            const id = (_builderUtilRuntime || _load_builderUtilRuntime()).UUID.v5((0, (_crypto || _load_crypto()).randomBytes)(4096), (_builderUtilRuntime || _load_builderUtilRuntime()).UUID.OID);
            _this8._logger.info(`Generated new staging user ID: ${id}`);
            try {
                yield (0, (_fsExtraP || _load_fsExtraP()).outputFile)(file, id);
            } catch (e) {
                _this8._logger.warn(`Couldn't write out staging user ID: ${e}`);
            }
            return id;
        })();
    }
}
exports.AppUpdater = AppUpdater;
function hasPrereleaseComponents(version) {
    const versionPrereleaseComponent = (0, (_semver || _load_semver()).prerelease)(version);
    return versionPrereleaseComponent != null && versionPrereleaseComponent.length > 0;
}
/** @private */
class NoOpLogger {
    info(message) {
        // ignore
    }
    warn(message) {
        // ignore
    }
    error(message) {
        // ignore
    }
}
exports.NoOpLogger = NoOpLogger; //# sourceMappingURL=AppUpdater.js.map