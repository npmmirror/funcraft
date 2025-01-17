'use strict';

const { getFcClient } = require('../client');
const { readFileChunk } = require('./cp/file');
const { getServiceMeta } = require('../import/service');

const path = require('path');
const _ = require('lodash');
const constants = require('./constants');
const PROXY = 'proxy';

function getNasHttpTriggerPath(serviceName) {
  let nasServiceName;
  if (serviceName.indexOf(constants.FUN_NAS_SERVICE_PREFIX) !== 0) {
    nasServiceName = constants.FUN_NAS_SERVICE_PREFIX + serviceName;
  } else {
    nasServiceName = serviceName;
  }
  return `/${PROXY}/${nasServiceName}/${constants.FUN_NAS_FUNCTION}/`;
}

async function getRequest(path, query, headers) {
  return await request('GET', path, query, headers);
}

async function postRequest(path, query, body, headers, opts) {
  return await request('POST', path, query, body, headers, opts);
}

async function request(method, path, query, body, headers, opts) {
  let fcClient = await getFcClient({
    timeout: constants.FUN_NAS_TIMEOUT
  });

  headers = Object.assign(headers || {}, {
    'X-Fc-Log-Type': 'Tail'
  });

  const res = await fcClient.request(method, path, query, body, headers, opts || {});

  const data = (res && res.data) || {};

  if (data.error) {
    throw new Error(data.error);
  }

  return res;
}

async function statsRequest(dstPath, nasHttpTriggerPath) {
  const urlPath = nasHttpTriggerPath + 'stats';
  const query = { dstPath };
  return await getRequest(urlPath, query);
}

async function sendCmdRequest(nasHttpTriggerPath, cmd) {
  const urlPath = nasHttpTriggerPath + 'commands';
  const query = {};
  const body = { cmd };

  return await postRequest(urlPath, query, body);
}

async function nasPathExsit(nasHttpTriggerPath, nasPath) {
  const urlPath = nasHttpTriggerPath + 'path/exsit';
  const query = { path: nasPath };
  return await getRequest(urlPath, query);
}

async function checkFileHash(nasHttpTriggerPath, nasFile, fileHash) {
  const urlPath = nasHttpTriggerPath + 'file/check';
  const query = { nasFile, fileHash };
  return await getRequest(urlPath, query);
}

async function sendZipRequest(nasHttpTriggerPath, nasPath, tmpNasZipPath) {
  const cmd = `cd ${path.dirname(nasPath)} && zip -r ${tmpNasZipPath} ${path.basename(nasPath)}`;
  return await sendCmdRequest(nasHttpTriggerPath, cmd);
}

async function sendDownLoadRequest(nasHttpTriggerPath, tmpNasZipPath) {
  const urlPath = nasHttpTriggerPath + 'download';
  const query = {};
  const body = { tmpNasZipPath };

  return await postRequest(urlPath, query, body, null, {
    rawBuf: true
  });
}

async function sendUnzipRequest(nasHttpTriggerPath, dstDir, nasZipFile, unzipFiles, noClobber) {
  let cmd;
  if (noClobber) {
    cmd = `unzip -q -n ${nasZipFile} -d ${dstDir}`;
  } else {
    cmd = `unzip -q -o ${nasZipFile} -d ${dstDir}`;
  }

  for (let unzipFile of unzipFiles) {
    cmd = cmd + ` '${unzipFile}'`;
  }

  return await sendCmdRequest(nasHttpTriggerPath, _.escapeRegExp(cmd));
}

async function sendCleanRequest(nasHttpTriggerPath, nasZipFile) {
  const urlPath = nasHttpTriggerPath + 'clean';
  const query = { nasZipFile };
  return await getRequest(urlPath, query);
}

async function createSizedNasFile(nasHttpTriggerPath, nasZipFile, fileSize) {
  const cmd = `dd if=/dev/zero of=${nasZipFile} count=0 bs=1 seek=${fileSize}`;
  return await sendCmdRequest(nasHttpTriggerPath, cmd);
}

async function uploadChunkFile(nasHttpTriggerPath, nasFile, zipFilePath, offSet) {
  const urlPath = nasHttpTriggerPath + 'file/chunk/upload';
  const fileStart = offSet.start;
  const fileSize = offSet.size;
  const query = {
    nasFile,
    fileStart: fileStart.toString()
  };

  const body = await readFileChunk(zipFilePath, fileStart, fileSize);

  const headers = {};
  return await postRequest(urlPath, query, body, headers);
}

// 检查远端 NAS 临时文件夹是否存在
// 不存在则创建，且权限赋予
async function checkRemoteNasTmpDir(nasHttpTriggerPath, remoteNasTmpDir) {
  const urlPath = nasHttpTriggerPath + 'tmp/check';
  const query = { remoteNasTmpDir };
  return await getRequest(urlPath, query);
}

async function getVersion(nasHttpTriggerPath) {
  const urlPath = nasHttpTriggerPath + 'version';
  return await getRequest(urlPath);
}

async function getNasConfig(serviceName) {
  const serviceMeta = await getServiceMeta(serviceName);
  return serviceMeta.nasConfig;
}

async function changeNasFilePermission(nasHttpTriggerPath, filePath, filePermission) {
  const cmd = `chmod ${filePermission} ${filePath}`;
  return await sendCmdRequest(nasHttpTriggerPath, cmd);
}

module.exports = {
  getVersion, getNasConfig, getNasHttpTriggerPath,
  createSizedNasFile, uploadChunkFile, statsRequest,
  checkRemoteNasTmpDir, checkFileHash, changeNasFilePermission, nasPathExsit,
  sendZipRequest, sendDownLoadRequest, sendCleanRequest, sendCmdRequest, sendUnzipRequest
};