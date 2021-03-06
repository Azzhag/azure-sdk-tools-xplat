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

'use strict';

var _ = require('underscore')
var azure = require('azure');
var xml2js = require('xml2js');

var fs = require('fs');
var path = require('path');

if (!fs.existsSync) {
  fs.existsSync = require('path').existsSync;
}

function ensureEnvironment() {
  if (!process.env.AZURE_TEST_ENVIRONMENT) {
    throw new Error('Please specify the environment to run tests in using the AZURE_TEST_ENVIRONMENT environment variable');
  }
  if (!process.env.AZURE_STORAGE_ACCOUNT) {
    throw new Error('Please specify the storage account containing management credentials in the AZURE_STORAGE_ACCOUNT environment variable');
  }
  if (!process.env.AZURE_STORAGE_ACCESS_KEY) {
    throw new Error('Please specify the access key for the storage account containing management credentials in the AZURE_STORAGE_ACCESS_KEY environment variable');
  }
}

function EnvironmentDownloader(tempPath) {
  if (!fs.existsSync(tempPath) || !fs.statSync(tempPath).isDirectory()) {
    throw new Error(tempPath + ' does not exist or is not a directory');
  }
  ensureEnvironment();
  this.path = path.resolve(tempPath);
  this.blobService = azure.createBlobService(process.env.AZURE_STORAGE_ACCOUNT, process.env.AZURE_STORAGE_ACCESS_KEY);
  this.blobContainer = 'testcredentials-' + process.env.AZURE_TEST_ENVIRONMENT;
}

function parsePublishSettings(fileName, callback) {
  var settings = _.clone(xml2js.defaults['0.2']);
  var parser = new xml2js.Parser(settings);
  var fullpath = path.resolve(this.path, fileName);
  fs.readFile(fullpath, 'utf8', function (err, data) {
    if (err) { return callback(err); }

    parser.parseString(data, function (err, result) {
      if (err) { return callback(err); }
      var results = [];
      result.PublishData.PublishProfile.forEach(function (profile) {
        var endpoint = profile.$.Url;
        profile.Subscription.forEach(function (subscription) {
          results.push({
            endpoint: endpoint,
            subscriptionId: subscription.$.Id,
            subscriptionName: subscription.$.Name,
            path: fullpath
          });
        });
      });
      callback(null, results);
    });
  });
}

function fullSettingsFilePath(settingsName) {
  return path.resolve(this.path, settingsName + '.publishsettings');
}

function downloadPublishSettings(settingsName, callback) {
  var self = this;
  var blobName = settingsName + '.publishsettings';
  var destPath = self._fullSettingsFilePath(settingsName);
  self.blobService.getBlobToFile(self.blobContainer, blobName, destPath, function (err) {
    if (err) { return callback(err); }

    self._parsePublishSettings(destPath, callback);
  });
}

function getPublishSettingsFromCache(settingsName, callback) {
  var destPath = this._fullSettingsFilePath(settingsName);
  this._parsePublishSettings(destPath, callback);
}

function getPublishSettings(settingsName, callback) {
  settingsName = settingsName.replace(/[ -.]/, '');
  if (fs.existsSync(this._fullSettingsFilePath(settingsName))) {
    this._getPublishSettingsFromCache(settingsName, callback);
  } else {
    this._downloadPublishSettings(settingsName, callback);
  }
}

_.extend(EnvironmentDownloader.prototype, {
  _parsePublishSettings: parsePublishSettings,
  _getPublishSettingsFromCache: getPublishSettingsFromCache,
  _downloadPublishSettings: downloadPublishSettings,
  _fullSettingsFilePath: fullSettingsFilePath,
  getPublishSettings: getPublishSettings
});

exports.EnvironmentDownloader = EnvironmentDownloader;