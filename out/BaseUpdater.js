"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.BaseUpdater = undefined;

var _bluebirdLst;

function _load_bluebirdLst() {
    return _bluebirdLst = require("bluebird-lst");
}

var _builderUtilRuntime;

function _load_builderUtilRuntime() {
    return _builderUtilRuntime = require("builder-util-runtime");
}

var _fsExtraP;

function _load_fsExtraP() {
    return _fsExtraP = require("fs-extra-p");
}

var _os;

function _load_os() {
    return _os = require("os");
}

var _path = _interopRequireWildcard(require("path"));

var _AppUpdater;

function _load_AppUpdater() {
    return _AppUpdater = require("./AppUpdater");
}

var _DownloadedUpdateHelper;

function _load_DownloadedUpdateHelper() {
    return _DownloadedUpdateHelper = require("./DownloadedUpdateHelper");
}

var _main;

function _load_main() {
    return _main = require("./main");
}

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

class BaseUpdater extends (_AppUpdater || _load_AppUpdater()).AppUpdater {
    constructor(options, app) {
        super(options, app);
        this.downloadedUpdateHelper = new (_DownloadedUpdateHelper || _load_DownloadedUpdateHelper()).DownloadedUpdateHelper();
        this.quitAndInstallCalled = false;
        this.quitHandlerAdded = false;
    }
    quitAndInstall(isSilent = false, isForceRunAfter = false) {
        this._logger.info(`Install on explicit quitAndInstall`);
        if (this.install(isSilent, isSilent ? isForceRunAfter : true)) {
            setImmediate(() => {
                this.app.quit();
            });
        }
    }
    executeDownload(downloadOptions, fileInfo, task) {
        var _this = this;

        return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function* () {
            if (_this.listenerCount((_main || _load_main()).DOWNLOAD_PROGRESS) > 0) {
                downloadOptions.onProgress = function (it) {
                    return _this.emit((_main || _load_main()).DOWNLOAD_PROGRESS, it);
                };
            }
            // use TEST_APP_TMP_DIR if defined and developer machine (must be not windows due to security reasons - we must not use env var in the production)
            const tempDir = yield (0, (_fsExtraP || _load_fsExtraP()).mkdtemp)(`${_path.join((process.platform === "darwin" ? process.env.TEST_APP_TMP_DIR : null) || (0, (_os || _load_os()).tmpdir)(), "up")}-`);
            const removeTempDirIfAny = function () {
                _this.downloadedUpdateHelper.clear();
                return (0, (_fsExtraP || _load_fsExtraP()).remove)(tempDir).catch(function () {
                    // ignored
                });
            };
            try {
                const destinationFile = _path.join(tempDir, _path.posix.basename(fileInfo.info.url));
                yield task(tempDir, destinationFile, removeTempDirIfAny);
                _this._logger.info(`New version ${_this.updateInfo.version} has been downloaded to ${destinationFile}`);
            } catch (e) {
                yield removeTempDirIfAny();
                if (e instanceof (_builderUtilRuntime || _load_builderUtilRuntime()).CancellationError) {
                    _this.emit("update-cancelled", _this.updateInfo);
                    _this._logger.info("Cancelled");
                }
                throw e;
            }
        })();
    }
    install(isSilent, isRunAfter) {
        if (this.quitAndInstallCalled) {
            this._logger.warn("install call ignored: quitAndInstallCalled is set to true");
            return false;
        }
        const installerPath = this.downloadedUpdateHelper.file;
        if (!this.updateAvailable || installerPath == null) {
            this.dispatchError(new Error("No update available, can't quit and install"));
            return false;
        }
        // prevent calling several times
        this.quitAndInstallCalled = true;
        try {
            this._logger.info(`Install: isSilent: ${isSilent}, isRunAfter: ${isRunAfter}`);
            return this.doInstall(installerPath, isSilent, isRunAfter);
        } catch (e) {
            this.dispatchError(e);
            return false;
        }
    }
    addQuitHandler() {
        if (this.quitHandlerAdded) {
            return;
        }
        this.quitHandlerAdded = true;
        this.app.once("quit", () => {
            if (!this.quitAndInstallCalled) {
                this._logger.info("Auto install update on quit");
                this.install(true, false);
            }
        });
    }
}
exports.BaseUpdater = BaseUpdater; //# sourceMappingURL=BaseUpdater.js.map