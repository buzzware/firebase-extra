import _ from 'lodash';

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

//const crypto = require('crypto');

var FirebaseAdminUtils = class {

	static encode(v) {
		if (_.isString(v) || _.isNumber(v) || _.isNull(v) || _.isBoolean(v))
			return v;

		if (_.isDate(v))
			return { "timestampValue": v }

		if (_.isArray(v)) {
			var tmp = new Array(v.length); //{"arrayValue": {"values": []}}
			for (var i = 0; i < v.length; i++) {
				tmp[i] = this.encode(v[i]);
			}
			return tmp;
		}

		if (_.isObject(v)) {
			var tmp = {};
			let keys = Object.keys(v);
			for (let k of keys) {
				if (k[0]=='_')
					continue;
				tmp[k] = this.encode(v[k]);
			}
			return tmp;
		}
		return null;
	}

	static getFireStoreProp(value) {
		const props = { 'arrayValue': 1, 'booleanValue': 1, 'geoPointValue': 1, 'integerValue': 1, 'mapValue': 1, 'nullValue': 1, 'referenceValue': 1, 'stringValue': 1, 'timestampValue': 1 };
		return Object.keys(value).find(k => props[k] === 1)
	}

	static decode(value) {
		if (_.isObject(value)) {
			const prop = this.getFireStoreProp(value);
			if (prop === 'integerValue') {
				value = Number(value[prop]);
			}
			else if (prop === 'arrayValue') {
				value = (value[prop].values || []).map(v => this.decode(v));
			}
			else if (prop === 'mapValue') {
				value = this.decode(value[prop].fields);
			}
			else if (prop === 'geoPointValue') {
				value = { latitude: 0, longitude: 0, ...value[prop] };
			}
			else if (prop === 'timestampValue') {
				value = new Date(Date.parse(value[prop]));
			}
			else if (prop) {
				value = value[prop];
			}
			else if (typeof value === 'object') {
				Object.keys(value).forEach(k => value[k] = this.decode(value[k]));
			}
		}
		return value;
	}

	static createModelInternal(aFirebaseAdminApp,input) {
		console.log('createModelInternal');
		console.log(JSON.stringify(input));
		var collection = input.collection;
		var data =  input.data;
		var Firestore = aFirebaseAdminApp.firestore().constructor;
		//var timestamp = firebase.firestore.FieldValue.serverTimestamp();
		//var timestamp = ‌‌admin.firestore.Timestamp.now(); //
		var timestamp = Firestore.Timestamp.now();
		data.created_at = timestamp;
		data.updated_at = timestamp;

		var docRef;
		var req;
		if (data.id) {
			docRef = aFirebaseAdminApp.firestore().collection(collection).doc(data.id);
			return new Promise(function(resolve, reject) {
				docRef.get()
					.catch(reject)
					.then((snap) => {
						if (snap.exists) {
							reject(new Error(`Document ${input.collection}/${input.data} already exists`));
						} else {
							if (_.isObject(data)) {
								console.log(JSON.stringify(data));
								docRef = aFirebaseAdminApp.firestore().collection(collection).doc(data.id);
								docRef.set(data).catch(reject).then(resolve);
							} else if (data===null || data===undefined) {
								resolve();
							} else
								throw Error('Data is of the wrong kind '+typeof(data));
						}
					});
			}).then(() => ({success: true, collection: collection, id: data.id}));
		} else {
			docRef = aFirebaseAdminApp.firestore().collection(collection).doc();
			data.id = docRef.id;
			req = docRef.set(data);
			return new Promise(function(resolve, reject){
				return req.then(() => {
					return resolve({success: true, collection: collection, id: data.id});
				}).catch(reject);
			});
		}
	}

	static updateModelInternal(aFirebaseAdminApp,input) {
		var collection = input.collection;
		var id = input.id;
		var data = Object.assign({},input.data);
		delete data.id;
		delete data.created_at;
		var Firestore = aFirebaseAdminApp.firestore().constructor;
		var timestamp = Firestore.Timestamp.now();
		data.updated_at = timestamp;

		var docRef = aFirebaseAdminApp.firestore().collection(collection).doc(id);
		var promise = new Promise(function(resolve, reject) {
			return docRef.update(data)
				.catch(reject)
				.then(() => {
					return resolve({success: true, collection: collection, id: id});
				});
		});
		return promise;
	}

	static destroyCollectionInternal(aFirebaseAdminApp,input) {
		var collection = input.collection;
		//var FirePromise = aFirebaseAdminApp.this.firebase.firebaseSdk.Promise;

		var request = aFirebaseAdminApp.firestore().collection(collection);

		var promise = new Promise(function (resolve, reject) {
			request.get().catch(reject).then((response) => {
				if (!response || response.empty) {
					resolve([]);
				} else {
					var promises = response.docs.map(d => d.ref.delete().catch(reject).then(() => d.id));
					return Promise.all(promises).catch(reject).then(resolve);
				}
			});
		});
		return promise;
	}

	// static fastHash(aString) {
	// 	const fastHasher = crypto.createHash('sha1');
	// 	const hashed = fastHasher.update(aString);
	// 	const digested = hashed.digest('base64');
	// 	return digested;
	// }

};

var isNode$1 = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');

var FirebaseExtraAdmin = class extends FirebaseExtra {

	constructor(config, firebaseSdk, adminSdk, serviceCredentials, asUid=null) {
		super(config, firebaseSdk);

// If you are using the Node.js Admin SDK in a Cloud Function, you can automatically initialize the SDK through the functions.config() variable:
// var app = admin.initializeApp(functions.config().firebase);

		this.adminSdk = adminSdk;
		// 'DEFAULT' must exist for some API methods that use the default instance
		var appname = this.adminSdk.apps.find(a=>a.name=='DEFAULT') ? config.projectId+'-admin'+Math.random().toString().replace('0.','-') : 'DEFAULT';
		var options = {
			credential: this.adminSdk.credential.cert(serviceCredentials),
			databaseURL: config.databaseURL
		};
		if (asUid)
			options.databaseAuthVariableOverride = { uid: asUid };
		this.adminApp = this.adminSdk.initializeApp(options,appname);
		this.adminApp.firestore().settings({timestampsInSnapshots: true});
	}

	dispose() {
		super.dispose();
		if (this.adminApp) {
			this.adminApp.delete();
			this.adminApp = null;
		}
	}

	get hostUrl() {
		return `https://${this.config.publicHost}`;
	}

	get firestore() {
		if (!this.adminApp)
			return super.firestore;
		return this.adminApp.firestore();
	}

	get adminAuth() {
		if (!this.adminSdk || !this.adminApp) // properties are read before init or create, so we return null and don't crash when no adminSdk
			return null;
		return this.adminSdk.auth(this.adminApp);
	}

	getUser(uid) {
		return FirebaseExtra.timeout(
			new Promise((resolve, reject) => {
				this.adminAuth.getUser(uid)
					.catch((e) => {
						if (!e.errorInfo || e.errorInfo.code != 'auth/user-not-found') {
							console.log(e.message);
							reject(e);
						} else {
							resolve(null);
						}
					})
					.then(resolve);
			}),
			this.timeoutms
		);
	}

	deleteUser(uid) {
		return FirebaseExtra.timeout(
			new Promise((resolve, reject) => {
				this.adminAuth.deleteUser(uid)
					.catch((e) => {
						if (!e.errorInfo || e.errorInfo.code != 'auth/user-not-found') {
							console.log(e.message);
							reject(e);
						} else {
							resolve(null);
						}
					})
					.then(resolve);
			}),
			this.timeoutms
		);
	}

	getUserByEmail(email) {
		return FirebaseExtra.timeout(
			new Promise((resolve, reject) => {
				this.adminAuth.getUserByEmail(email)
					.catch((e) => {
						if (!e.errorInfo || e.errorInfo.code != 'auth/user-not-found') {
							console.log(e.message);
							reject(e);
						} else {
							resolve(null);
						}
					})
					.then(resolve);
			}),
			this.timeoutms
		);
	}

	getUserByPhoneNumber(phone) {
		return FirebaseExtra.timeout(
			new Promise((resolve, reject) => {
				this.adminAuth.getUserByPhoneNumber(phone)
					.catch((e) => {
						if (!e.errorInfo || e.errorInfo.code != 'auth/user-not-found') {
							console.log(e.message);
							reject(e);
						} else {
							resolve(null);
						}
					})
					.then(resolve);
			}),
			this.timeoutms
		);
	}

	updateUser(uid,changes) {
		var result = this.adminAuth.updateUser(uid,changes);
		return FirebaseExtra.timeout(result,this.timeoutms);
	}

	// This seems to be necessary, otherwise I was getting weirdness awaiting on createUserWithEmailAndPassword
	createUser(aFields) {
		var result = this.adminAuth.createUser(aFields);
		return FirebaseExtra.timeout(result,this.timeoutms);
	}

	createModel(aCollection,aData) {
		return FirebaseExtra.timeout(FirebaseAdminUtils.createModelInternal(this.adminApp,{collection: aCollection,data: aData}),this.timeoutms);
	}

	updateModel(aCollection,aId,aData) {
		return FirebaseExtra.timeout(FirebaseAdminUtils.updateModelInternal(this.adminApp,{collection: aCollection,id: aId, data: aData}),this.timeoutms);
	}

	destroyAll(aCollection) {
		return FirebaseExtra.timeout(FirebaseAdminUtils.destroyCollectionInternal(this.adminApp,{collection: aCollection}),this.timeoutms);
	}

	forAllUsers(callback,batchCount=50,batchTimeoutms=30000,nextPageToken=undefined) {
		// List batch of users, 1000 at a time.

		let firebasePromise = this.adminAuth.listUsers(batchCount, nextPageToken)
			.then(async (listUsersResult) => {
				for (let u of listUsersResult.users)
					await callback(u);
				if (listUsersResult.pageToken)
					await this.forAllUsers(callback,batchCount,batchTimeoutms,listUsersResult.pageToken);
			});
		return FirebaseExtra.timeout(firebasePromise,batchTimeoutms);
	}

	async destroyAllUsers() {
		let uidBatch = [];
		await this.forAllUsers(async (user)=> {
			uidBatch.push(user.uid);
			if (uidBatch.length>=10) {
				let deleteUids = uidBatch;
				uidBatch = [];
				await Promise.all(deleteUids.map((uid)=>this.deleteUser(uid)));
			}
		},10,60000);
		await Promise.all(uidBatch.map((uid)=>this.deleteUser(uid)));
	}

	calcDisplayName(aUserOrDetails) {
		var displayName = null;
		if (aUserOrDetails.first_name || aUserOrDetails.last_name)
			displayName = `${aUserOrDetails.first_name} ${aUserOrDetails.last_name}`;
		else if (aUserOrDetails.email)
			displayName = aUserOrDetails.email;
		else if (aUserOrDetails.phoneNumber)
			displayName = aUserOrDetails.phoneNumber;
		else if (aUserOrDetails.uid)
			displayName = uid;
		return displayName;
	}

	async ensureUserAndPerson(aDetails) {
		aDetails = Object.assign({},aDetails);
		console.log('ensureUserAndPerson ' + aDetails.email);
		var {email, password, phoneNumber, photoURL, person} = aDetails;
		person = person || {};
		var user = null;

		var email_user = email && await this.getUserByEmail(email);

		var phone_user = phoneNumber && await this.getUserByPhoneNumber(phoneNumber);

		if (email_user && phone_user && email_user.uid == phone_user.uid) { // both pre-existing and the same, so no problem
			user = phone_user;
		} else if (phone_user) {
			if (email_user) {       // email pre-existing, so remove references to email user and work with phone_user
				email = undefined;
				aDetails.email = undefined;
			}
			user = phone_user;
		} else if (email_user) {
			if (phone_user) {       // phone pre-existing, so remove references to phone user and work with phone_user
				phoneNumber = undefined;
				aDetails.phoneNumber = undefined;
			}
			user = email_user;
		}

		if (user) {
			let updates = {};
			if (email && email!=user.email)
				updates.email = email;
			if (password)
				updates.password = password;
			if (phoneNumber && phoneNumber!=user.phoneNumber)
				updates.phoneNumber = phoneNumber;
			if (photoURL && photoURL!=user.photoURL)
				updates.photoURL = photoURL;
			if (!user.displayName || aDetails.displayName!=user.displayName) {
				let displayName = aDetails.displayName || this.calcDisplayName(Object.assign({}, user, aDetails, person));
				if (displayName && displayName!=user.displayName)
					updates.displayName = displayName;
			}
			if (Object.keys(updates).length)
				user = await this.updateUser(user.uid, updates);
		}

		if (user == null) {
			try {
				//let createRequest = new this.adminSdk.auth.CreateRequest(aDetails);
				let createRequest = {email,password,phoneNumber,photoURL};
				let displayName = this.calcDisplayName(Object.assign({},aDetails,person));
				if (displayName)
					createRequest.displayName = displayName;
				user = await this.createUser(createRequest);
				console.log('user created');
			} catch (e) {
				console.log(e.message);
			}
		}

		var person_id = user.uid;
		var key = "Person__" + person_id;
		var dbPerson = await this.kojacKeyGet(key);
		if (!dbPerson) {
			dbPerson = {
				uid: person_id
			};
			await this.kojacKeySet(key, dbPerson);
		}
		var person_updates = {};
		let person_keys = 'first_name last_name company_name phone participant_id roles role_nodes photoURL metrics_name carer_id caree_id instructor_id real'.split(' ');
		for (let k of Object.keys(person)) {
			if (!person_keys.includes(k))
				continue;
			if (dbPerson[k]!==person[k])
				person_updates[k] = person[k];
		}
		await this.kojacKeyUpdate(key, person_updates);

		return {
			user: user,
			person_key: key,
			uid: user.uid
		};
	}

	createCustomToken(aUid, aClaims) {
		let promise = new Promise((resolve, reject) => {
			this.adminAuth.createCustomToken(aUid, aClaims).then(resolve,reject);
		});
		return FirebaseExtra.timeout(promise,this.timeoutms);
	}

	createSessionCookie(aIdToken,expiresInms) {
		let promise = new Promise((resolve, reject) => {
			this.adminAuth.createSessionCookie(aIdToken, {expiresIn: expiresInms}).then(resolve,reject);
		});
		return FirebaseExtra.timeout(promise,this.timeoutms);
	}

	verifySessionCookie(aCookie,aCheckRevoked) {
		let promise = new Promise((resolve, reject) => {
			this.adminAuth.verifySessionCookie(aCookie,aCheckRevoked).then(resolve,reject);
		});
		return FirebaseExtra.timeout(promise,this.timeoutms);
	}
};

export default FirebaseExtraAdmin;
