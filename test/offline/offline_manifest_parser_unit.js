/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('OfflineManifestParser', () => {
  // The offline manifest parser does not need the player interface, so
  // this is a work around to avoid creating one.
  const playerInterface =
      /** @type {shaka.extern.ManifestParser.PlayerInterface} */({});

  // A session id that will be found in the manifest created by |makeManifest|.
  const sessionId = 'session-id';

  /** @type {!shaka.offline.OfflineManifestParser} */
  let parser;

  beforeEach(checkAndRun(async () => {
    // Make sure we start with a clean slate.
    await clearStorage();
    parser = new shaka.offline.OfflineManifestParser();
  }));

  afterEach(checkAndRun(async () => {
    parser.stop();
    // Make sure that we don't waste storage by leaving stuff in storage.
    await clearStorage();
  }));

  it('returns manifest from storage', checkAndRun(async () => {
    const inputManifest = makeManifest();

    /** @type {!shaka.offline.OfflineUri} */
    let uri;

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();
      const handle = await muxer.getActive();
      const keys = await handle.cell.addManifests([inputManifest]);

      uri = shaka.offline.OfflineUri.manifest(
          handle.path.mechanism, handle.path.cell, keys[0]);
    } finally {
      await muxer.destroy();
    }

    const outputManifest = await parser.start(uri.toString(), playerInterface);
    expect(outputManifest).toBeTruthy();
  }));

  it('updates expiration', checkAndRun(async () => {
    const newExpiration = 1000;

    const inputManifest = makeManifest();
    // Make sure that the expiration is different from the new expiration
    // so that when we check that they are the same later, it actually
    // means that it changed.
    expect(inputManifest.expiration).not.toBe(newExpiration);

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();
      const handle = await muxer.getActive();
      const keys = await handle.cell.addManifests([inputManifest]);

      /** @type {!shaka.offline.OfflineUri} */
      const uri = shaka.offline.OfflineUri.manifest(
          handle.path.mechanism, handle.path.cell, keys[0]);

      await parser.start(uri.toString(), playerInterface);
      await parser.onExpirationUpdated(sessionId, newExpiration);

      const found = await handle.cell.getManifests(keys);
      expect(found[0].expiration).toBe(newExpiration);
    } finally {
      await muxer.destroy();
    }
  }));

  it('fails if manifest was not found', checkAndRun(async () => {
    const inputManifest = makeManifest();

    /** @type {!shaka.offline.OfflineUri} */
    let uri;

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();
      const handle = await muxer.getActive();
      const keys = await handle.cell.addManifests([inputManifest]);

      uri = shaka.offline.OfflineUri.manifest(
          handle.path.mechanism, handle.path.cell, keys[0]);

      // Remove the manifest so that the uri will point to nothing.
      const noop = () => {};
      await handle.cell.removeManifests(keys, noop);
    } finally {
      await muxer.destroy();
    }

    try {
      await parser.start(uri.toString(), playerInterface);
    } catch (e) {
      expect(e.code).toBe(shaka.util.Error.Code.KEY_NOT_FOUND);
    }
  }));

  it('fails for invalid URI', checkAndRun(async () => {
    const uri = 'this-is-an-invalid-uri';

    try {
      await parser.start(uri, playerInterface);
      fail();
    } catch (e) {
      expect(e.code).toBe(shaka.util.Error.Code.MALFORMED_OFFLINE_URI);
    }
  }));

  it('ignores update expiration when data is deleted',
      checkAndRun(async () => {
        const newExpiration = 1000;

        const inputManifest = makeManifest();

        /** @type {!shaka.offline.StorageMuxer} */
        const muxer = new shaka.offline.StorageMuxer();
        try {
          await muxer.init();
          const handle = await muxer.getActive();
          const keys = await handle.cell.addManifests([inputManifest]);

          const uri = shaka.offline.OfflineUri.manifest(
              handle.path.mechanism, handle.path.cell, keys[0]);

          await parser.start(uri.toString(), playerInterface);

          // Remove the manifest after we have parsed it so that the
          // update won't find it. Oh, we are sneaky.
          const noop = () => {};
          await handle.cell.removeManifests(keys, noop);
          await parser.onExpirationUpdated(sessionId, newExpiration);
        } finally {
          await muxer.destroy();
        }
      }));

  it('ignores update expiration with unknown session',
      checkAndRun(async () => {
        const wrongSession = 'this-session-wont-be-found';
        const newExpiration = 1000;

        const inputManifest = makeManifest();
        const oldExpiration = inputManifest.expiration;

        // Make sure that the expirations are not the same.
        expect(oldExpiration).not.toBe(newExpiration);

        /** @type {!shaka.offline.StorageMuxer} */
        const muxer = new shaka.offline.StorageMuxer();

        try {
          await muxer.init();
          const handle = await muxer.getActive();
          const keys = await handle.cell.addManifests([inputManifest]);

          const uri = shaka.offline.OfflineUri.manifest(
              handle.path.mechanism, handle.path.cell, keys[0]);

          await parser.start(uri.toString(), playerInterface);
          await parser.onExpirationUpdated(wrongSession, newExpiration);

          // Make sure that the expiration was not updated.
          const found = await handle.cell.getManifests(keys);
          expect(found[0].expiration).toBe(oldExpiration);
        } finally {
          await muxer.destroy();
        }
      }));

  /**
   * @return {!shaka.extern.ManifestDB}
   */
  function makeManifest() {
    const mb = 1024 * 1024;
    const seconds = 1.0;

    /** @type {shaka.extern.ManifestDB} */
    const manifest = {
      originalManifestUri: '',
      duration: 600 * seconds,
      size: 100 * mb,
      expiration: Infinity,
      periods: [],
      sessionIds: [sessionId],
      drmInfo: null,
      appMetadata: {},
    };

    return manifest;
  }

  /**
   * @return {!Promise}
   */
  async function clearStorage() {
    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();
    try {
      await muxer.erase();
    } finally {
      await muxer.destroy();
    }
  }

  /**
   * Before running the test, check if storage is supported on this
   * platform.
   *
   * @param {function():!Promise} test
   * @return {function():!Promise}
   */
  function checkAndRun(test) {
    return async () => {
      const hasSupport = shaka.offline.StorageMuxer.support();
      if (hasSupport) {
        await test();
      } else {
        pending('Storage is not supported on this platform.');
      }
    };
  }
});
