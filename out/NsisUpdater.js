'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
exports.NsisUpdater = undefined;

var _bluebirdLst;

function _load_bluebirdLst() {
  return (_bluebirdLst = require('bluebird-lst'));
}

var _builderUtilRuntime;

function _load_builderUtilRuntime() {
  return (_builderUtilRuntime = require('builder-util-runtime'));
}

var _child_process;

function _load_child_process() {
  return (_child_process = require('child_process'));
}

var _path = _interopRequireWildcard(require('path'));

require('source-map-support/register');

var _BaseUpdater;

function _load_BaseUpdater() {
  return (_BaseUpdater = require('./BaseUpdater'));
}

var _FileWithEmbeddedBlockMapDifferentialDownloader;

function _load_FileWithEmbeddedBlockMapDifferentialDownloader() {
  return (_FileWithEmbeddedBlockMapDifferentialDownloader = require('./differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader'));
}

var _GenericDifferentialDownloader;

function _load_GenericDifferentialDownloader() {
  return (_GenericDifferentialDownloader = require('./differentialDownloader/GenericDifferentialDownloader'));
}

var _main;

function _load_main() {
  return (_main = require('./main'));
}

var _Provider;

function _load_Provider() {
  return (_Provider = require('./Provider'));
}

var _windowsExecutableCodeSignatureVerifier;

function _load_windowsExecutableCodeSignatureVerifier() {
  return (_windowsExecutableCodeSignatureVerifier = require('./windowsExecutableCodeSignatureVerifier'));
}

function _interopRequireWildcard(obj) {
  if (obj && obj.__esModule) {
    return obj;
  } else {
    var newObj = {};
    if (obj != null) {
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key))
          newObj[key] = obj[key];
      }
    }
    newObj.default = obj;
    return newObj;
  }
}

class NsisUpdater extends (_BaseUpdater || _load_BaseUpdater()).BaseUpdater {
  constructor(options, app) {
    super(options, app);
  }
  /*** @private */
  doDownloadUpdate(updateInfo, cancellationToken) {
    var _this = this;

    return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function*() {
      const provider = yield _this.provider;
      const fileInfo = (0, (_Provider || _load_Provider()).findFile)(
        provider.resolveFiles(updateInfo),
        'exe'
      );
      const requestHeaders = yield _this.computeRequestHeaders();
      const downloadOptions = {
        skipDirCreation: true,
        headers: requestHeaders,
        cancellationToken,
        sha512: fileInfo.info.sha512
      };
      let packagePath = _this.downloadedUpdateHelper.packagePath;
      let installerPath = _this.downloadedUpdateHelper.getDownloadedFile(
        updateInfo,
        fileInfo
      );
      if (installerPath != null) {
        return packagePath == null
          ? [installerPath]
          : [installerPath, packagePath];
      }
      yield _this.executeDownload(
        downloadOptions,
        fileInfo,
        (() => {
          var _ref = (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(
            function*(tempDir, destinationFile, removeTempDirIfAny) {
              installerPath = destinationFile;
              if (
                yield _this.differentialDownloadInstaller(
                  fileInfo,
                  'OLD',
                  installerPath,
                  requestHeaders,
                  provider
                )
              ) {
                yield _this.httpExecutor.download(
                  fileInfo.url.href,
                  installerPath,
                  downloadOptions
                );
              }
              const signatureVerificationStatus = yield _this.verifySignature(
                installerPath
              );
              if (signatureVerificationStatus != null) {
                yield removeTempDirIfAny();
                // noinspection ThrowInsideFinallyBlockJS
                throw (0,
                (_builderUtilRuntime || _load_builderUtilRuntime()).newError)(
                  `New version ${
                    _this.updateInfo.version
                  } is not signed by the application owner: ${signatureVerificationStatus}`,
                  'ERR_UPDATER_INVALID_SIGNATURE'
                );
              }
              const packageInfo = fileInfo.packageInfo;
              if (packageInfo != null) {
                packagePath = _path.join(
                  tempDir,
                  `package-${updateInfo.version}${_path.extname(
                    packageInfo.path
                  ) || '.7z'}`
                );
                if (
                  yield _this.differentialDownloadWebPackage(
                    packageInfo,
                    packagePath,
                    provider
                  )
                ) {
                  yield _this.httpExecutor.download(
                    packageInfo.path,
                    packagePath,
                    {
                      skipDirCreation: true,
                      headers: requestHeaders,
                      cancellationToken,
                      sha512: packageInfo.sha512
                    }
                  );
                }
              }
            }
          );

          return function(_x, _x2, _x3) {
            return _ref.apply(this, arguments);
          };
        })()
      );
      _this.downloadedUpdateHelper.setDownloadedFile(
        installerPath,
        packagePath,
        updateInfo,
        fileInfo
      );
      _this.addQuitHandler();
      _this.emit((_main || _load_main()).UPDATE_DOWNLOADED, _this.updateInfo);
      return packagePath == null
        ? [installerPath]
        : [installerPath, packagePath];
    })();
  }
  // $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
  // | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
  // | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
  verifySignature(tempUpdateFile) {
    var _this2 = this;

    return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function*() {
      let publisherName;
      try {
        publisherName = (yield _this2.configOnDisk.value).publisherName;
        if (publisherName == null) {
          return null;
        }
      } catch (e) {
        if (e.code === 'ENOENT') {
          // no app-update.yml
          return null;
        }
        throw e;
      }
      return yield (0,
      (
        _windowsExecutableCodeSignatureVerifier ||
        _load_windowsExecutableCodeSignatureVerifier()
      )
        .verifySignature)(Array.isArray(publisherName) ? publisherName : [publisherName], tempUpdateFile, _this2._logger);
    })();
  }
  doInstall(installerPath, isSilent, isForceRunAfter) {
    const args = ['--updated'];
    if (isSilent) {
      args.push('/S');
    }
    if (isForceRunAfter) {
      args.push('--force-run');
    }
    const packagePath = this.downloadedUpdateHelper.packagePath;
    if (packagePath != null) {
      // only = form is supported
      args.push(`--package-file=${packagePath}`);
    }
    const spawnOptions = {
      detached: true,
      stdio: 'ignore'
    };

    let subprocess = (0, (_child_process || _load_child_process()).spawn)(
      installerPath,
      args,
      spawnOptions
    );
    subprocess.on('error', e => {
      if (e.code === 'UNKNOWN' || e.code === 'EACCES') {
        // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
        this._logger.info(
          'Access denied or UNKNOWN error code on spawn, will be executed again using elevate'
        );
        (0, (_child_process || _load_child_process()).spawn)(
          _path.join(process.resourcesPath, 'elevate.exe'),
          [installerPath].concat(args),
          spawnOptions
        ).unref();
      } else {
        this.dispatchError(e);
      }
    });
    subprocess.unref();

    return true;
  }
  differentialDownloadInstaller(
    fileInfo,
    oldFile,
    installerPath,
    requestHeaders,
    provider
  ) {
    var _this3 = this;

    return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function*() {
      if (process.env.__NSIS_DIFFERENTIAL_UPDATE__ == null) {
        return true;
      }
      try {
        const blockMapData = JSON.parse(
          yield provider.httpRequest(
            (0, (_main || _load_main()).newUrlFromBase)(
              `${fileInfo.url.pathname}.blockMap.json`,
              fileInfo.url
            )
          )
        );
        yield new (
          _GenericDifferentialDownloader ||
          _load_GenericDifferentialDownloader()
        ).GenericDifferentialDownloader(fileInfo.info, _this3.httpExecutor, {
          newUrl: fileInfo.url.href,
          oldFile,
          logger: _this3._logger,
          newFile: installerPath,
          useMultipleRangeRequest: provider.useMultipleRangeRequest,
          requestHeaders
        }).download(blockMapData);
      } catch (e) {
        _this3._logger.error(
          `Cannot download differentially, fallback to full download: ${e.stack ||
            e}`
        );
        // during test (developer machine mac) we must throw error
        return process.platform === 'win32';
      }
      return false;
    })();
  }
  differentialDownloadWebPackage(packageInfo, packagePath, provider) {
    var _this4 = this;

    return (0, (_bluebirdLst || _load_bluebirdLst()).coroutine)(function*() {
      if (packageInfo.blockMapSize == null) {
        return true;
      }
      try {
        yield new (
          _FileWithEmbeddedBlockMapDifferentialDownloader ||
          _load_FileWithEmbeddedBlockMapDifferentialDownloader()
        ).FileWithEmbeddedBlockMapDifferentialDownloader(
          packageInfo,
          _this4.httpExecutor,
          {
            newUrl: packageInfo.path,
            oldFile: _path.join(process.resourcesPath, '..', 'package.7z'),
            logger: _this4._logger,
            newFile: packagePath,
            requestHeaders: _this4.requestHeaders,
            useMultipleRangeRequest: provider.useMultipleRangeRequest
          }
        ).download();
      } catch (e) {
        _this4._logger.error(
          `Cannot download differentially, fallback to full download: ${e.stack ||
            e}`
        );
        // during test (developer machine mac or linux) we must throw error
        return process.platform === 'win32';
      }
      return false;
    })();
  }
}
exports.NsisUpdater = NsisUpdater; //# sourceMappingURL=NsisUpdater.js.map
