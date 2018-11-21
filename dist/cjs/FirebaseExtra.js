'use strict';

var isNode = (typeof module !== 'undefined' && module.exports);

var FirebaseExtra = class {

  constructor(config, firebaseSdk) {
    this.config = config;
    this.firebaseSdk = firebaseSdk;
    this.timeoutms = 20000;
    console.log('before initializeApp');
    // 'DEFAULT' must exist for some API methods that use the default instance
    if (this.firebaseSdk) {
      var appname = this.firebaseSdk.apps.find(a => a.name == 'DEFAULT') ? config.projectId + '-admin' + Math.random().toString().replace('0.', '-') : 'DEFAULT';
      this.app = this.firebaseSdk.initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId
      }, appname);
      this.app.firestore().settings({timestampsInSnapshots: true});
    }
  }

  dispose() {
    if (this.app) {
      this.app.delete();
      this.app = null;
    }
  }

  get auth() {
    if (!this.firebaseSdk || !this.app) // properties are read before init or create, so we return null and don't crash when no firebase
      return null;
    var auth = this.firebaseSdk.auth(this.app);
    auth.setPersistence(isNode ? this.firebaseSdk.auth.Auth.Persistence.NONE : this.firebaseSdk.auth.Auth.Persistence.LOCAL);
    return auth;
  }

  get firestore() {
    if (!this.app) // properties are read before init or create, so we return null and don't crash when no firebase
      return null;
    return this.app.firestore();
  }

  kojacKeySet(aKey, aValue) {
    var [r, i] = aKey.split('__');
    var result = this.firestore.collection(r).doc(i).set(aValue);
    return FirebaseExtra.timeout(result,this.timeoutms);
  }

  kojacKeyGetRef(aKey,aOptions) {
    var [r, i] = aKey.split('__');
    var result = this.firestore.collection(r).doc(i).get(aOptions);
    return FirebaseExtra.timeout(result,this.timeoutms);
  }

  async kojacKeyGet(aKey,aOptions) {
    var ref = await this.kojacKeyGetRef(aKey,aOptions);
    return ref.exists ? ref.data() : null;
  }

  kojacKeyUpdate(aKey,aUpdates) {
    if (!Object.keys(aUpdates).length)
      return Promise.resolve();
    var [r, i] = aKey.split('__');
    var result = this.firestore.collection(r).doc(i).update(aUpdates);
    return FirebaseExtra.timeout(result,this.timeoutms);
  }

  kojacKeyClear(aKey) {
    var [r, i] = aKey.split('__');
    if (!i)
      throw new Error('clear all of a resource not supported');

    var result = this.firestore.collection(r).doc(i).delete();
    return FirebaseExtra.timeout(result,this.timeoutms);
  }

  createItem(resource, value) {
    var result = this.firestore.collection(resource).add(value).then(docRef=> {
      return docRef.get().then(doc => {
        if (!doc.exists)
          return null;
        var data = doc.data();
        if (data && !data.id) {
          data.id = docRef.id;
          return docRef.update({id: docRef.id}).then(() => data);
        } else {
          return data;
        }
      });
    });
    return FirebaseExtra.timeout(result,this.timeoutms);
  }

  async getAllWhere(aCollection,aLimit,...aWhere) {
    var query = this.firestore.collection(aCollection);
    var whereArgs = aWhere.slice(0);
    while(whereArgs.length) {
      var clause = whereArgs.splice(0,3);
      query = query.where(...clause);
    }
    if (aLimit)
      query = query.limit(aLimit);
    var results = await FirebaseExtra.timeout(query.get(),this.timeoutms);
    return results.empty ? [] : results.docs;
  }

  async docWhere(aCollection,...aWhere) {
    var results = await this.getAllWhere(aCollection,1,...aWhere);
    return results.length ? results[0] : null;
  }

  docsWhere(aCollection,...aWhere) {
    return this.getAllWhere(aCollection,null,...aWhere);
  }

  async getOneWhere(aCollection,...aWhere) {
    var doc = await this.docWhere(aCollection,...aWhere);
    return doc && doc.data();
  }

  async getWhere(aCollection,...aWhere) {
    var results = await this.getAllWhere(aCollection,null,...aWhere);
    return results.empty ? [] : results.map(d=>d.data());
  }

  signIn(email, password) {
    var result = this.auth.signInWithEmailAndPassword(email, password);
    return FirebaseExtra.timeout(result,this.timeoutms);
  }

  ensureSignedOut() {
    var result = this.auth.signOut();
    return FirebaseExtra.timeout(result,this.timeoutms);
  }

  currentUser() {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.auth.onAuthStateChanged(user => {
        unsubscribe();
        resolve(user);
      }, reject);
    });
  }

  currentUserId () { return this.currentUser().then(u => u ? u.uid : null); }

  getCurrentPerson() {
    return this.currentUser().then(u => u ? this.kojacKeyGet('Person__'+u.uid) : null);
  }

  async HandleResponse(aResponse) {
    let result = aResponse.headers.get('Content-Type').indexOf('json')>=0 ? await aResponse.json() : await aResponse.text();
    if (aResponse.ok) {
      if (typeof(result) == 'string')
        return {message: result};
      else
        return result;
    } else {
      let e = new Error(aResponse.statusText);
      e.body = result;
      throw e;
    }
  }

  async postFunction(aFunction,aInput) {
    let body = aInput;//this.encode(aInput);
    let url = this.config.functionsBaseUrl+aFunction;

    let response = await fetch(url, {
      method: 'post',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    return await this.HandleResponse(response);
  }

  async getFunction(aFunction,aParams) {
    let response = await fetch(aFunction,{
      method: 'get',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      params: aParams
    });
    return await this.HandleResponse(response);
  }
};

// BEGIN from https://github.com/building5/promise-timeout

FirebaseExtra.TimeoutError = function() {
  Error.call(this);
  this.stack = Error().stack;
  this.message = 'Timeout';
};
FirebaseExtra.TimeoutError.prototype = Object.create(Error.prototype);
FirebaseExtra.TimeoutError.prototype.name = "TimeoutError";

/**
 * Rejects a promise with a {@link FirebaseTimeout} if it does not settle within
 * the specified timeout.
 *
 * @param {Promise} promise The promise.
 * @param {number} timeoutMillis Number of milliseconds to wait on settling.
 * @returns {Promise} Either resolves/rejects with `promise`, or rejects with
 *                   `TimeoutError`, whichever settles first.
 */
FirebaseExtra.timeout = function(promise, timeoutMillis) {
  var error = new FirebaseExtra.TimeoutError(),
    timeout;

  return Promise.race([
    promise,
    new Promise(function(resolve, reject) {
      timeout = setTimeout(function() {
        reject(error);
      }, timeoutMillis);
    }),
  ]).then(function(v) {
    clearTimeout(timeout);
    return v;
  }, function(err) {
    clearTimeout(timeout);
    throw err;
  });
};

module.exports = FirebaseExtra;
