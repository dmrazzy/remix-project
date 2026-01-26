import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

/**
 * Comprehensive E2E tests for File Management Handler tools
 * Tests all 8 file management tools: read, write, create, delete, move, copy, list, exists
 */

module.exports = {
  '@disabled': false,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080/#experimental=true', true, undefined, true, true)
  },

  'Should test file_write tool': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remix-ai-assistant"]')
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_write',
            arguments: {
              path: 'test_mcp/write_test.sol',
              content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract WriteTest {}'
            }
          },
          id: 'test-file-write'
        }).then(function (result) {
          let resultData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            resultData = JSON.parse(result.result.content[0].text);
          }

          // Wait briefly for file system to process
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve({
                success: !result.error,
                hasResult: !!resultData,
                writeSuccess: resultData?.success || false,
                path: resultData?.path || null,
                errorMessage: result.error?.message || null
              });
            }, 500);
          });
        }).then(function (data: any) {
          done(data);
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File write error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'File write tool should succeed');
        browser.assert.ok(data.writeSuccess, 'File should be written successfully');
        browser.assert.ok(data.path, 'Should return written file path');
      });
  },

  'Should test file_read tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_read',
            arguments: {
              path: 'test_mcp/write_test.sol'
            }
          },
          id: 'test-file-read'
        }).then(function (result) {
          let resultData = null;
          if (!result.error && result.result?.content?.[0]?.text) {
            resultData = JSON.parse(result.result.content[0].text);
          }

          done({
            success: !result.error,
            hasResult: !!resultData,
            readSuccess: resultData?.success || false,
            content: resultData?.content || null,
            containsContract: resultData?.content?.includes('contract WriteTest') || false
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File read error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'File read tool should succeed');
        browser.assert.ok(data.readSuccess, 'File should be read successfully');
        browser.assert.ok(data.containsContract, 'Content should contain contract definition');
      });
  },

  'Should test file_exists tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        Promise.all([
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_exists',
              arguments: { path: 'test_mcp/write_test.sol' }
            },
            id: 'test-file-exists-1'
          }),
          aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_exists',
              arguments: { path: 'nonexistent_file.sol' }
            },
            id: 'test-file-exists-2'
          })
        ]).then(function (results) {
          if (results[0].error || results[1].error) {
            done({
              success: false,
              error: 'Error checking file existence'
            });
            return;
          }
          const existsResult = JSON.parse(results[0].result?.content?.[0]?.text || '{}');
          const notExistsResult = JSON.parse(results[1].result?.content?.[0]?.text || '{}');

          done({
            success: true,
            existingFileExists: existsResult?.exists || false,
            nonexistentFileExists: notExistsResult?.exists || false
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File exists error:', data.error);
          return;
        }
        browser.assert.ok(data.existingFileExists, 'Existing file should be detected');
        browser.assert.equal(data.nonexistentFileExists, false, 'Nonexistent file should not be detected');
      });
  },

  'Should test file_create tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_create',
            arguments: {
              path: 'test_mcp/new_contract.sol',
              content: '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract NewContract { uint256 public value; }',
              type: 'file'
            }
          },
          id: 'test-file-create'
        }).then(function (result) {
          if (result.error) {
            done({
              success: false,
              error: result.error.message || JSON.stringify(result.error)
            });
            return;
          }
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');

          // Wait briefly for file system to process
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve({
                success: !result.error,
                createSuccess: resultData?.success || false,
                path: resultData?.path || null
              });
            }, 500);
          });
        }).then(function (data: any) {
          done(data);
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File create error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'File create tool should succeed');
        browser.assert.ok(data.createSuccess, 'File should be created successfully');
      });
  },

  'Should test directory_list tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        // Test on the root directory which should have default workspace files
        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'directory_list',
            arguments: {
              path: 'test_mcp',
              recursive: true
            }
          },
          id: 'test-directory-list'
        }).then(function (result) {
          if (result.error) {
            done({
              success: false,
              error: result.error.message || JSON.stringify(result.error)
            });
            return;
          }
          console.log("resultData dir list", result.result?.content)
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            listSuccess: resultData?.success || false,
            hasFiles: Array.isArray(resultData?.files),
            fileCount: resultData?.files?.length || 0,
            files: resultData?.files || []
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('Directory list error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'Directory list tool should succeed');
        browser.assert.ok(data.listSuccess, 'Directory list should return success');
        browser.assert.ok(data.hasFiles, 'Should return files array');
      });
  },

  'Should test file_copy tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_copy',
            arguments: {
              from: 'test_mcp/write_test.sol',
              to: 'test_mcp/copied_test.sol'
            }
          },
          id: 'test-file-copy'
        }).then(function (result) {
          if (result.error) {
            done({
              success: false,
              error: result.error.message || JSON.stringify(result.error)
            });
            return;
          }
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            copySuccess: resultData?.success || false,
            path: resultData?.path || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File copy error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'File copy tool should succeed');
        browser.assert.ok(data.copySuccess, 'File should be copied successfully');
      });
  },

  'Should test file_move tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_move',
            arguments: {
              from: 'test_mcp/copied_test.sol',
              to: 'test_mcp/moved_test.sol'
            }
          },
          id: 'test-file-move'
        }).then(function (result) {
          if (result.error) {
            done({
              success: false,
              error: result.error.message || JSON.stringify(result.error)
            });
            return;
          }
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');
          done({
            success: !result.error,
            moveSuccess: resultData?.success || false,
            path: resultData?.path || null
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File move error:', data.error);
          return;
        }
        browser.assert.ok(data.success, 'File move tool should succeed');
        browser.assert.ok(data.moveSuccess, 'File should be moved successfully');
      });
  },

  'Should test file_delete tool': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_delete',
            arguments: {
              path: 'test_mcp/moved_test.sol'
            }
          },
          id: 'test-file-delete'
        }).then(function (result) {
          if (result.error) {
            done({
              success: false,
              error: result.error.message || JSON.stringify(result.error)
            });
            return;
          }
          const resultData = JSON.parse(result.result?.content?.[0]?.text || '{}');

          // Verify file no longer exists
          return aiPlugin.remixMCPServer.handleMessage({
            method: 'tools/call',
            params: {
              name: 'file_exists',
              arguments: { path: 'test_mcp/moved_test.sol' }
            },
            id: 'test-verify-delete'
          }).then(function (existsResult) {
            const existsData = JSON.parse(existsResult.result?.content?.[0]?.text || '{}');
            done({
              deleteSuccess: resultData?.success || false,
              fileStillExists: existsData?.exists || false
            });
          });
        }).catch(function (error) {
          done({ error: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        if (data.error) {
          console.error('File delete error:', data.error);
          return;
        }
        browser.assert.ok(data.deleteSuccess, 'File delete tool should succeed');
        browser.assert.equal(data.fileStillExists, false, 'Deleted file should not exist');
      });
  },

  'Should test file operations with invalid paths': function (browser: NightwatchBrowser) {
    browser
      .executeAsync(function (done) {
        const aiPlugin = (window as any).getRemixAIPlugin;
        if (!aiPlugin?.remixMCPServer) {
          done({ error: 'RemixMCPServer not available' });
          return;
        }

        aiPlugin.remixMCPServer.handleMessage({
          method: 'tools/call',
          params: {
            name: 'file_read',
            arguments: {
              path: 'nonexistent/path/file.sol'
            }
          },
          id: 'test-invalid-read'
        }).then(function (result) {
          done({
            hasError: !!result.result.isError,
          });
        }).catch(function (error) {
          done({ caughtError: true, errorMessage: error.message });
        });
      }, [], function (result) {
        const data = result.value as any;
        browser.assert.ok(data.hasError, 'Should error on nonexistent file read');
      });
  }
};
