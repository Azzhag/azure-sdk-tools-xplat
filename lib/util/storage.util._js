/**
* Copyright (c) Microsoft.  All rights reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var azure = require('azure');
var flows = require('streamline/lib/util/flows');
var os = require('os');
var StorageServiceSettings = azure.StorageServiceSettings;
var utils = require('../util/utils.js');

/**
* Module variables
*/
var cli = null;
var logger = null;
var progress = null;

/**
* Limit the concurrent REST calls
*/
var restFunnel = null;

/**
* Storage rest operation time out
*/
var operationTimeout = null;

/**
* Storage Utilities for storage blob/queue/table command
*/
var StorageUtil = {};

/**
* Storge connection string environment variable name and it's also used azure storage powershell.
*/
StorageUtil.ENV_CONNECTIONSTRING_NAME = 'AZURE_STORAGE_CONNECTION_STRING';
StorageUtil.CONCURRENTCY_CONFIG_KEY_NAME = 'azure_storage_concurrency';
StorageUtil.OPERATION_TIMEOUT_CONFIG_KEY_NAME = 'azure_storage_timeout'; //Milliseconds

/**
* Storage Operation Type
*/
StorageUtil.OperationType = {
  Blob  : 'blob',
  Queue : 'queue',
  Table : 'table'
};

/**
* Init cli module
*/
StorageUtil.init = function(azureCli) {
  cli = azureCli;
  logger = cli.output;
  var cfg = utils.readConfig();
  var restConcurrency = getRestConcurrency (cfg);
  restFunnel = flows.funnel(restConcurrency);
  operationTimeout = getRestOperationTimeout(cfg);
};

/**
* Create an Storage operation
* @constructor
* @param {OperationType} [type] Storage operation type
* @param {string} [operation] Operation name
*/
StorageUtil.StorageOperation = function(type, operation){
  this.type = type;
  this.operation = operation;
};

/**
* Get blob service with the specified or default connection string
* @param {string} [connectionString] Storage connection string
* @return {BlobService} BlobService object from node sdk
*/
StorageUtil.getBlobService = function(connectionString) {
  var serviceSettings = getStorageServiceSettings(connectionString);
  if (serviceSettings === null) {
    //Use the default blob service, nodesdk will use the AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY environment variables
    return azure.createBlobService();
  } else {
    return azure.createBlobService(serviceSettings._name, serviceSettings._key, serviceSettings._blobEndpointUri);
  }
};

/**
* Get table service with the specified or default connection string
* @param {string} [connectionString] Storage connection string
* @return {TableService} TableService object from node sdk
*/
StorageUtil.getTableService = function(connectionString) {
  var serviceSettings = getStorageServiceSettings(connectionString);
  if (serviceSettings === null) {
    //Use the default table service, nodesdk will use the AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY environment variables
    return azure.createTableService();
  } else {
    return azure.createTableService(serviceSettings._name, serviceSettings._key, serviceSettings._tableEndpointUri);
  }
};

/**
* Get queue service with the specified or default connection string
* @param {string} [connectionString] Storage connection string
* @return {QueueService} QueueService object from node sdk
*/
StorageUtil.getQueueService = function(connectionString) {
  var serviceSettings = getStorageServiceSettings(connectionString);
  if(serviceSettings === null) {
    //Use the default queue service, nodesdk will use the AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY environment variables
    return azure.createQueueService();
  } else {
    return azure.createQueueService(serviceSettings._name, serviceSettings._key, serviceSettings._queueEndpointUri);
  }
};

/**
* Perform Storage REST operation, this function accepts dynamic parameters
* All parameters except the first one will be treated as the parameters of the specified operation
* @param {StorageOperation} storageOperation Storage operation
* @param {Callback} _ call back function
*/
StorageUtil.performStorageOperation = function (storageOperation, _) {
  if(storageOperation === null) return;
  var service = null;
  var type = (storageOperation.type || '').toLowerCase();
  var operation = storageOperation.operation || '';

  switch(type) {
  case StorageUtil.OperationType.Blob :
    service = StorageUtil.getBlobService();
    break;
  case StorageUtil.OperationType.Table :
    service = StorageUtil.getTableService();
    break;
  case StorageUtil.OperationType.Queue :
    service = StorageUtil.getQueueService();
    break;
  default :
    throw 'Invalid azure operation type : ' + type;
  }

  if (!service[operation] || !isFunction(service[operation])) {
    throw 'Invalid operation "' + operation + '" in ' + type + ' service';
  }

  //The number of the explicitly defined parameters for this method
  var definedParameterCount = 2;
  var operationArgs = Array.prototype.slice.call(arguments).slice(definedParameterCount, arguments.length);

  var result = null;
  restFunnel(_, function(_) {
    /*jshint camelcase:false*/
    result = service[operation].apply_(_, service, operationArgs);
    /*jshint camelcase:true*/
  });
  return result;
};

/**
* Start cli operation progress
*/
StorageUtil.startProgress = function(tips) {
  if (progress !== null) {
    StorageUtil.endProgress();
  }
  progress = cli.progress(tips);
};

/**
* End cli operation progress
*/
StorageUtil.endProgress = function() {
  if (progress !== null) {
    progress.end();
  }
  progress = null;
};

/**
* Set REST operation time out
*/
StorageUtil.setOperationTimeout = function(options) {
  if(options.timeoutintervalInMs === undefined &&
    operationTimeout !== null && !isNaN(operationTimeout) && operationTimeout > 0) {
    options.timeoutIntervalInMs = operationTimeout;
  }
};

/**
* Check whether the specified parameter is a function
* @param {object} func An arbitrary javascript object
* @return {bool} true if the specified object is function, otherwise false
*/
function isFunction(func) {
  return typeof func === 'function';
}

/**
* Get storage service settings with the specified or default connection string
* @param {string} [connectionString] Storage connection string
* @return {StorageServiceSettings} return the storage service settings if the connection string is applied, otherwise return null.
*/
function getStorageServiceSettings(connectionString) {
  if (!connectionString) {
    connectionString = process.env[StorageUtil.ENV_CONNECTIONSTRING_NAME];
  }
  if (!connectionString) {
    return null;
  } else {
    return StorageServiceSettings.createFromConnectionString(connectionString);
  }
}

/**
* Get REST operation time out
*/
function getRestOperationTimeout(cfg) {
  var radix = 10;
  var definedTimeout = parseInt(cfg[StorageUtil.OPERATION_TIMEOUT_CONFIG_KEY_NAME], radix);
  if (isNaN(definedTimeout) || definedTimeout <= 0) {
    return null;
  } else {
    return definedTimeout;
  }
}

/**
* Get the REST conccurency
*/
function getRestConcurrency(cfg) {
  var radix = 10;
  var definedConcurrency = parseInt(cfg[StorageUtil.CONCURRENTCY_CONFIG_KEY_NAME], radix);
  if (isNaN(definedConcurrency) || definedConcurrency === 0) {
    return getDefaultRestConcurrency();
  } else {
    return definedConcurrency;
  }
}

/**
* Get the default REST concurrency
*/
function getDefaultRestConcurrency() {
  var cpuCount = os.cpus().length;
  /// Hard code number for default task amount per core
  var  asyncTasksPerCoreMultiplier = 1;
  return cpuCount * asyncTasksPerCoreMultiplier;
}

module.exports = StorageUtil;
