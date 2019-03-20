const RoleNode = class RoleNode {
	constructor(aRoles,aFullRole) {
		this.roles = aRoles;
		this.full_role = aFullRole;
	}

	superior(aLeaf) {
		let full = this.full_role+'.'+aLeaf;
		this.roles.add(full);
		return new RoleNode(this.roles,full);
	}
};

const Roles = class Roles {

	static rolesContain(aRoleTree, aRole) {
		var nodeRole = !aRole.includes('.');
		if (nodeRole) {
			return !!aRoleTree.find(r => r.split('.').indexOf(aRole)>=0);
		} else {
			return !!aRoleTree.find(r => r.startsWith(aRole));
		}
	}

	static isMember(aPerson) {
		return this.rolesContain(aPerson.roles, Role.MEMBER_ROLE);
	}

	static expandFullRoles(aRoles) {
		if (aRoles && !Array.isArray(aRoles))
			aRoles = [aRoles];
		var result = [];
		for (let r of aRoles) {
			var nodes = r.split('.');
			for (let n of nodes) {
				if (!result.includes(n))
					result.push(n);
			}
		}
		return result;
	}

	// returns a list of sorted role names eg. ['manager','member','user','vip']
	static expandRoles(
		aRoleTree,	// a list of full roles eg. ['user.member.manager','user.member.vip']
		aSpecRoles	// a list of role names eg. ['manager','vip']
	) {
		if (aSpecRoles && !Array.isArray(aSpecRoles))
			aSpecRoles = [aSpecRoles];
		else if (!aSpecRoles)
			aSpecRoles = [];
		var result = [];
		for (let sr of aSpecRoles) {
			for (let lr of aRoleTree) {
				var lrnodes = lr.split('.');
				let nodei = lrnodes.indexOf(sr);
				if (nodei < 0)
					continue;
				for (let i = 0; i <= nodei; i++) {
					let n = lrnodes[i];
					if (!result.includes(n))
						result.push(n);
				}
			}
		}
		result.sort();
		return result;
	}

	static leaf(aFullRole) {
		if (!aFullRole)
			return null;
		var lrnodes = aFullRole.split('.');
		if (!lrnodes.length)
			return null;
		return lrnodes[lrnodes.length-1];
	}

	// add a full role to the tree. Probably should use root and/or superior instead
	static add(aFullRole) {
		this.tree.push(aFullRole);
	}

	// add a root node to the tree and return a node to use superior()
	static root(aLeaf) {
		let node = new RoleNode(this,aLeaf);
		this.add(aLeaf);
		return node;
	}

	static fullRole(aSpecRole,aRoleTree) {
		if (aSpecRole.contains('.'))
			return aSpecRole;
		for (let tr of aRoleTree) {
			var trnodes = tr.split('.');
			let nodei = trnodes.indexOf(aSpecRole);
			if (nodei >= 0)
				return trnodes.slice(0, nodei + 1);
		}
	}

};

Roles.tree = [];

var isNode = (typeof module !== 'undefined' && module.exports);

var FirebaseExtra = class {

  constructor(config, firebaseSdk) {
    this.config = config;
    this.firebaseSdk = firebaseSdk;
    this.timeoutms = 20000;
    this.auth_persistence = null;
    this.inited = false;
    console.log('before initializeApp');
    // '[DEFAULT]' must exist for some API methods that use the default instance
    if (this.firebaseSdk) {
      var appname = this.firebaseSdk.apps.find(a => a.name == '[DEFAULT]') ? config.projectId + '-admin' + Math.random().toString().replace('0.', '-') : '[DEFAULT]';
      this.app = this.firebaseSdk.initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId
      }, appname);
      if (this.firebaseSdk.auth)
        this.auth_persistence = this.firebaseSdk.auth.Auth.Persistence.LOCAL;
      if (this.app.firestore())
        this.app.firestore().settings({timestampsInSnapshots: true});
    }
  }

  // Call auth.setPersistence with auth_persistence value
  // this is async
  _applyAuthPersistence() {
    return new Promise((resolve, reject) => {
      if (!this.auth_persistence)
        resolve();
      this.auth.setPersistence(this.auth_persistence)
        .then(resolve)
        .catch(reject);
    });
  }

  async init() {
    if (this.inited)
      return;
    this.inited = true;
    await this._applyAuthPersistence();
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
    return auth;
  }

  get firestore() {
    if (!this.app) // properties are read before init or create, so we return null and don't crash when no firebase
      return null;
    return this.app.firestore();
  }

  getRef(aCollection,aId,aOptions={}) {
    var result = this.firestore.collection(aCollection).doc(String(aId)).get(aOptions);
    return FirebaseExtra.timeout(result,this.timeoutms);
  }
  
  async get(aCollection,aId) {
    var ref = await this.getRef(aCollection,aId);
    return ref.exists ? ref.data() : undefined;
  }
  
  async getFresh(aCollection,aId) {
    var ref = await this.getRef(aCollection,aId,{source: 'server'});
    return ref.exists ? ref.data() : undefined;
  }
  
  set(aCollection,aId,aValues) {
    var result = this.firestore.collection(aCollection).doc(String(aId)).set(aValues).then(()=>aValues);
    return FirebaseExtra.timeout(result,this.timeoutms);
  }
  
  clear(aCollection,aId) {
    if (!aId)
      throw new Error('clear all of a resource not supported');
    var result = this.firestore.collection(aCollection).doc(String(aId)).delete();
    return FirebaseExtra.timeout(result,this.timeoutms);
  }
  
  // Create a document in the given collection with the given values
  // * if the values contain an id, it will become the document id. Otherwise an id will be generated and the id property set to it.
  // * returns a shallow clone of the values, with the id set
  create(aCollection,aValues) {
    let id = aValues.id;
    if (!id)
      id = this.firestore.collection(aCollection).doc().id;
    aValues = Object.assign({},aValues,{id});
    return this.set(aCollection,id,aValues);
  }

  // Update a document
  // will fail if the document doesn't exist
  // Returns a promise resolving to undefined
  update(aCollection,aId,aUpdates) {
    if (!Object.keys(aUpdates).length)
      return Promise.resolve();
    var result = this.firestore.collection(aCollection).doc(String(aId)).update(aUpdates);
    return FirebaseExtra.timeout(result,this.timeoutms);
  }

  get serverTimestamp() {
    return this.firebaseSdk.firestore.FieldValue.serverTimestamp();
  }

  get deleteFieldValue() {
    return this.firebaseSdk.firestore.FieldValue.delete();
  }

  // Use this with the modelFieldsOk security rules function
  // This function automatically sets created_at and updated_at for creating on the server,
  // and removes them from the response. If you need them, use modelCreateAndGet
  modelCreate(aCollection,aValues) {
    aValues = Object.assign({},aValues,{
      created_at: this.serverTimestamp,
      updated_at: this.serverTimestamp
    });
    let response = this.create(aCollection,aValues);
    delete response.created_at;
    delete response.updated_at;
    return response;
  }

  // This calls modelCreate, then gets the result from the server, ensuring
  // that you have a full and correct copy of the model from the server.
  async modelCreateAndGet(aCollection,aValues) {
    var response = await this.modelCreate(aCollection,aValues);
    var result = await this.getFresh(response.collection,response.id);
    return result;
  }

  // Use this with the modelFieldsOk security rules function
  // This functions automatically sets updated_at and protects id and created_at from abuse
  modelUpdate(aCollection,aId,aValues) {
    aValues = Object.assign({},aValues,{
      updated_at: this.serverTimestamp
    });
    delete aValues.id;
    delete aValues.created_at;
    return this.update(aCollection,aId,aValues);
  }

  async modelUpdateAndGet(aCollection,aId,aValues) {
    var response = await this.modelUpdate(aCollection,aId,aValues);
    var result = await this.getFresh(response.collection,response.id);
    return result;
  }

  // try to create, then update if it already exists
  async crupdate(aCollection, aId, aValues) {
    if (!aValues || !Object.keys(aValues))
      return;
    try {
      let createValues;
      if (aId) {
        createValues = Object.assign({},aValues);
        createValues.id = aId;
      } else {
        createValues = aValues;
      }
      await this.create(aCollection, createValues);
    } catch(e) {
      if (!aId)		// id wasn't given, so the failure must be something besides a key clash
        throw e;
      await this.update(aCollection, aId, aValues);
    }
  }

  // !!! could also add upsert(), which tries to update then creates if missing

  async modelCrupdate(aCollection, aId, aValues) {
    if (!aValues || !Object.keys(aValues))
      return;
    try {
      let createValues;
      if (aId) {
        createValues = Object.assign({},aValues);
        createValues.id = aId;
      } else {
        createValues = aValues;
      }
      await this.modelCreate(aCollection, createValues);
    } catch(e) {
      if (!aValues || !Object.keys(aValues))
        return;
      await this.modelUpdate(aCollection, aId, aValues);
    }
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
    return this.init().then(()=>{
      return new Promise((resolve, reject) => {
        const unsubscribe = this.auth.onAuthStateChanged(user => {
          unsubscribe();
          resolve(user||null);
        }, reject);
      });
    });
  }

  currentUserId () { return this.currentUser().then(u => u ? u.uid : null); }

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
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate'
      },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    return await this.HandleResponse(response);
  }

  async getFunction(aFunction,aParams) {
    let response = await fetch(aFunction,{
      method: 'get',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate'
      },
      credentials: 'same-origin',
      params: aParams
    });
    return await this.HandleResponse(response);
  }

  //
  //  Deprecated Below
  //

  getCurrentPerson() {
    return this.currentUser().then(u => u ? this.kojacKeyGet('Person__'+u.uid) : null);
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

FirebaseExtra.Roles = Roles;

export default FirebaseExtra;
export { Roles };
