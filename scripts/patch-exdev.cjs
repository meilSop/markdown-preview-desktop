/**
 * EXDEV 降级补丁（亿赛通透明加密环境专用）：
 * 本机加密驱动会劫持 rename 系统调用，导致同目录内 rename 报
 * "EXDEV: cross-device link not permitted"（electron-builder 打包
 * 重命名 LICENSE → LICENSE.electron.txt 时必现）。
 * 此补丁捕获 EXDEV 后降级为 copy + delete，语义等价。
 * 用法：$env:NODE_OPTIONS="--require ./scripts/patch-exdev.cjs"; electron-builder --win
 */
const fs = require("fs");

function rmSyncRetry(p) {
  // 亿赛通驱动异步加密新建文件，紧随其后的目录删除可能报
  // ENOTEMPTY/EBUSY：等待锁释放后重试（同步阻塞，Atomics.wait）
  for (let i = 0; i < 6; i++) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
      return;
    } catch (e) {
      if (i === 5) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
}

function downgrade(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
    rmSyncRetry(src);
  } else {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

const origRenameSync = fs.renameSync;
fs.renameSync = function (src, dest) {
  try {
    return origRenameSync.call(fs, src, dest);
  } catch (err) {
    if (err && (err.code === "EXDEV" || err.code === "EPERM")) {
      downgrade(src, dest);
      return;
    }
    throw err;
  }
};

const origRename = fs.promises.rename;
fs.promises.rename = async function (src, dest) {
  try {
    return await origRename.call(fs.promises, src, dest);
  } catch (err) {
    if (err && (err.code === "EXDEV" || err.code === "EPERM")) {
      downgrade(src, dest);
      return;
    }
    throw err;
  }
};
