/**
* Copyright 2012 Microsoft Corporation
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

var should = require('should');
var utils = require('../../lib/util/utils');
var executeCmd = require('../framework/cli-executor').execute;
var MockedTestUtils = require('../framework/mocked-test-utils');

var suiteUtil;
var testPrefix = 'cli.storage.blob-tests';
var fakeConnectionString = 'DefaultEndpointsProtocol=http;AccountName=yaotest;AccountKey=null';

/**
* Convert a cmd to azure storge cli
*/
String.prototype.toStorageCmd = function () {
  var azurejs = 'cli.js';
  var storageCmd = 'node ' + azurejs + ' storage ';
  var options = '--json';
  var self = this.trim();
  var cmds = storageCmd;
  if (self.length) {
    cmds += self;
  }
  cmds = cmds.split(' ');
  cmds.push(options);
  return cmds;
}

describe('cli', function() {
  describe('storage', function() {
    var savedConnectionString = '';

    before(function (done) {
      savedConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      process.env.AZURE_STORAGE_CONNECTION_STRING = fakeConnectionString;

      suiteUtil = new MockedTestUtils(testPrefix);

      if (suiteUtil.isMocked) {
        utils.POLL_REQUEST_INTERVAL = 0;
      }

      suiteUtil.setupSuite(done);
    });

    after(function (done) {
      process.env.AZURE_STORAGE_CONNECTION_STRING = savedConnectionString;
      suiteUtil.teardownSuite(done);
    });

    beforeEach(function (done) {
      suiteUtil.setupTest(done);
    });

    afterEach(function (done) {
      suiteUtil.teardownTest(done);
    });

    describe('container', function() {
      describe('list', function() {
        it('should list all storage containers', function(done) {
          var cmd = "container list".toStorageCmd();
          executeCmd(cmd, function(result) {
            var containers = JSON.parse(result.text);
            containers.length.should.greaterThan(0);
            containers.forEach(function(container) {
              container.name.length.should.greaterThan(0);
            });
            containers.some(function(container) {
              return container.publicAccessLevel == 'Container'
                || container.publicAccessLevel == "Blob"
                || container.publicAccessLevel == 'Off';
            }).should.be.true;
            done();
          });
        });

        it('should support wildcard', function(done) {
          var cmd = "container list t*4".toStorageCmd();
          executeCmd(cmd, function(result) {
            var containers = JSON.parse(result.text);
            containers.length.should.greaterThan(0);
            containers.forEach(function(container) {
              container.name.should.match(/t.*4/);
            });
            done();
          });
        });
      });
    });
  }); 
});
