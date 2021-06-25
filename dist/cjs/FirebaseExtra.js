'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var _ = _interopDefault(require('lodash'));

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
		if (aSpecRole.includes('.'))
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

  constructor(config, firebaseSdk, app = null) {
    this.config = config;
    this.firebaseSdk = firebaseSdk;
    this.timeoutms = 20000;
    this.auth_persistence = null;
    this.inited = false;
    console.log('before initializeApp');
    if (app) {  // mainly for testing with @firebase/rules-unit-testing
      this.app = app;
      let auth = app.auth();
      auth.useEmulator("http://localhost:9099");
      this.auth_persistence = this.firebaseSdk.auth.Auth.Persistence.LOCAL;
    } else {    // using actual firebase instance
      if (this.firebaseSdk) {
        // '[DEFAULT]' must exist for some API methods that use the default instance
        var appname = this.firebaseSdk.apps.find(a => a.name == '[DEFAULT]') ? config.projectId + '-admin' + Math.random().toString().replace('0.', '-') : null; //'[DEFAULT]';
        let conf = {
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId
        };
        this.app = appname ? this.firebaseSdk.initializeApp(conf, appname) : this.firebaseSdk.initializeApp(conf);
        if (this.firebaseSdk.auth)
          this.auth_persistence = this.firebaseSdk.auth.Auth.Persistence.LOCAL;
      }
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

  static isPromise(obj) {
    return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function';
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
  async create(aCollection,aValues) {
    let id = aValues.id;
    if (!id)
      id = this.firestore.collection(aCollection).doc().id;
    if (await this.exists(aCollection,id))
      throw new Error('Cannot create when document already exists with that id');
    aValues = Object.assign({},aValues,{id});
    return await this.set(aCollection,id,aValues);
  }

  update(aCollection,aId,aUpdates) {
    if (!Object.keys(aUpdates).length)
      return Promise.resolve();
    var result = this.firestore.collection(aCollection).doc(String(aId)).update(aUpdates);
    aUpdates = Object.assign({},aUpdates,{id: aId});
    return FirebaseExtra.timeout(result,this.timeoutms).then(()=> aUpdates);
  }

  async exists(aCollection,aId,aCheckServer=true) {
		var ref = await this.getRef(aCollection, aId, aCheckServer ? {source: 'server'} : {});
		return !!ref.exists;
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
  async modelCreate(aCollection,aValues) {
    aValues = Object.assign({},aValues,{
      created_at: this.serverTimestamp,
      updated_at: this.serverTimestamp
    });
    let response = await this.create(aCollection,aValues);
    delete response.created_at;
    delete response.updated_at;
    return response;
  }

  // This calls modelCreate, then gets the result from the server, ensuring
  // that you have a full and correct copy of the model from the server.
  async modelCreateAndGet(aCollection,aValues) {
    var response = await this.modelCreate(aCollection,aValues);
    var result = await this.getFresh(aCollection,response.id);
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
    var result = await this.getFresh(aCollection,aId);
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
      return await this.create(aCollection, createValues);
    } catch(e) {
      if (!aId)		// id wasn't given, so the failure must be something besides a key clash
        throw e;
      return await this.update(aCollection, aId, aValues);
    }
  }

  // !!! could also add upsert(), which tries to update then creates if missing
  async modelCrupdate(aCollection, aId, aValues) {
    if (!aValues || !Object.keys(aValues))
      return Promise.resolve();
    try {
      let createValues;
      if (aId) {
        createValues = Object.assign({},aValues);
        createValues.id = aId;
      } else {
        createValues = aValues;
      }
      return await this.modelCreate(aCollection, createValues);
    } catch(e) {
      if (!aValues || !Object.keys(aValues))
        return;
      return await this.modelUpdate(aCollection, aId, aValues);
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

  collectionWhereQuery(aCollection, ...aWhere) {
		var query = this.firestore.collection(aCollection);
		var whereArgs = aWhere.slice(0);
		while(whereArgs.length) {
			var clause = whereArgs.splice(0,3);
			query = query.where(...clause);
		}
		return query;
	}

	/*
	Use like this :

      let result = await firebase.getOr(
        firebase.getAllWhere('Promotion',null,'phone_number','==',ourNumber,'enabled_from','<=',now),
        firebase.getAllWhere('Promotion',null,'phone_number','==',ourNumber,'enabled_from','==',null)
      );
	 */
  async getOr(...aDocsPromises) {
    let allDocs = await Promise.all(aDocsPromises);
    return allDocs = _(allDocs).flatten().compact().value();
  }

  async queryBatch(aQuery,aHandler,aBatchSize=10) {
    if (aBatchSize)
      aQuery = aQuery.limit(aBatchSize);
    let docs;
    while (!docs || (docs.length===aBatchSize)) {
      if (docs)
        aQuery = aQuery.startAfter(docs[docs.length-1]);

      let results;
      try {
        results = await FirebaseExtra.timeout(aQuery.get());
      } catch(e) {
        if (e.code==9)      // need index generated, so make sure dev sees this
          console.error(e);
        throw e;
      }
      docs = results.empty ? [] : results.docs;
      let datas = docs.map(doc => doc.data());
      let response = aHandler(datas,docs);
      if (FirebaseExtra.isPromise(response))
        response = await response;
    }
  }

  // async
  queryBatchParallel(aQuery,aHandler,aBatchSize=10) {
    return this.queryBatch(
      aQuery,
      (datas,docs)=>{
        let promises = [];
        for(let i=0;i<datas.length;i++) {
          promises[i] = aHandler(datas[i],docs[i]);
        }
        return Promise.all(promises);
      },
      aBatchSize
    );
  }

  // Build a Firestore query using where, orderBy, limit, startAfter etc from a query object or
  // collection name and parameters object, and return it.
  buildQuery(aCollectionOrQuery, aParams) {
    let query;
    if (_.isString(aCollectionOrQuery))
      query = this.firestore.collection(aCollectionOrQuery);
    else
      query = aCollectionOrQuery;
    if (aParams) {
      if (aParams.where) {
        if (Array.isArray(aParams.where)) {
          var whereArgs = aParams.where.slice(0);
          while (whereArgs.length) {
            var clause = whereArgs.splice(0, 3);
            let [k, o, v] = clause;
            if (o == '=')
              o = '==';
            if (v === undefined)
              v = null;
            query = query.where(k, o, v);
          }
        } else if (_.isObject(aParams.where)) {
          for (let k of Object.keys(aParams.where)) {
            let v = aParams.where[k];
            if (v === undefined)
              v = null;
            query = query.where(k, '==', v);
          }
        }
      }
      let orderBy = aParams.orderBy;
      if (orderBy) {
        let pairs = [];
        if (!Array.isArray(orderBy))
          orderBy = [orderBy];
        for (let v of orderBy) {
          if (_.isString(v)) {
            let parts = v.split(' ');
            pairs.push(parts);
          }
        }
        for (let p of pairs)
          query = query.orderBy(...p);
      }
      if (aParams.limit)
        query = query.limit(aParams.limit);
      if (aParams.startAfter)
        query = query.startAfter(aParams.startAfter);
    }
    return query;
  }

  // extends query() with startAfterId and potentially other parameters
  // usage : (await firebase.buildQueryEx({...params...})).
  async buildQueryEx(aCollectionOrQuery, aParams) {
    let colObj;
    if (aParams && aParams.startAfterId) {
      if (_.isString(aCollectionOrQuery))
        colObj = this.firestore.collection(aCollectionOrQuery);
      else
        colObj = aCollectionOrQuery;
      var ref = colObj.doc(String(aParams.startAfterId)).get();
      aParams = _.omit(aParams,'startAfterId');
      aParams.startAfter = await ref;
    }
    return this.buildQuery(colObj || aCollectionOrQuery,aParams);
  }

  async query(aCollectionOrQuery, aParams) {
    return FirebaseExtra.timeout(this.buildQueryEx(aCollectionOrQuery,aParams).then(q=>q.get()).then(result => _.map(result.docs, d => d.data())));
  }

  forBatchParallel(aCollection,...args) {
    let aHandler = args.pop();
    let batchsize = (args.length % 3 > 0) ? args.pop() : 10;
    let query = this.collectionWhereQuery(aCollection,...args);
    return this.queryBatchParallel(query,aHandler,batchsize);
  }

	async forQueryBatch(aQuery,aBatchSize,aHandler) {
    if (aBatchSize)
      aQuery = aQuery.limit(aBatchSize);
    let docs;
    while (!docs || (docs.length==aBatchSize)) {
      if (docs)
        aQuery = aQuery.startAfter(docs[docs.length-1]);

      let results;
      try {
        results = await FirebaseExtra.timeout(aQuery.get(), this.timeoutms);
      } catch(e) {
        if (e.code==9)      // need index generated, so make sure dev sees this
          console.error(e);
        throw e;
      }
      docs = results.empty ? [] : results.docs;
      let response = aHandler(docs.map(d=>d.data()));
      if (FirebaseExtra.isPromise(response))
        response = await response;
    }
	}

	// Convenience method combining collectionWhereQuery and forQueryBatch
	// usage : await firebase.forBatch('Things',10,'color','==','red','size','==','large',(thing) => { /* do something */ })
	//
  // async
  forBatch(aCollection,aBatchSize,...args) {
    let aHandler = args.pop();
    let query = this.collectionWhereQuery(aCollection,...args);
    return this.forQueryBatch(query,aBatchSize,aHandler);
  }

  // async
  forBatchEach(aCollection,aBatchSize,...args) {
    let aHandler = args.pop();
    let query = this.collectionWhereQuery(aCollection,...args);
    return this.forQueryBatch(query,aBatchSize, async (items) => {
      for (let item of items) {
        let response = aHandler(item);
        if (FirebaseExtra.isPromise(response))
          await response;
      }
    });
  }

  async getAllWhere(aCollection,aLimit,...aWhere) {
  	let query = this.collectionWhereQuery(aCollection,...aWhere);
    if (aLimit)
      query = query.limit(aLimit);
    let results;
    try {
      results = await FirebaseExtra.timeout(query.get(), this.timeoutms);
    } catch(e) {
      if (e.code==9)      // need index generated, so make sure dev sees this
        console.error(e);
      throw e;
    }
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

  getSessionToken(aForceRefresh=false) {
    let user = this.auth && this.auth.currentUser;
    if (!user)
      return Promise.resolve(null);
    var promise = this.auth.currentUser.getIdToken(aForceRefresh);
    return FirebaseExtra.timeout(promise,this.timeoutms);
  }

  async HandleResponse(aResponse) {
    let result;
    let contentType = aResponse.headers.get('Content-Type');
    if (contentType && contentType.indexOf('json')>=0)
      result = await aResponse.json();
    else
      result = await aResponse.text();
    if (aResponse.ok) {
      if (typeof(result) == 'string')
        return {message: result};
      else
        return result;
    } else {
      let e = new Error(aResponse.statusText);
      e.statusCode = aResponse.status;
      e.body = result;
      throw e;
    }
  }

  async _postLikeFunction(aMethod,aFunction,aInput) {
    let body = aInput;//this.encode(aInput);
    let url = aFunction[0]=='/' ? aFunction : this.config.functionsBaseUrl+aFunction;
    let token = await this.getSessionToken();

    let headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate'
    };
    if (token)
      headers.Authorization = 'Bearer '+token;
    let response = await fetch(url, {
      method: aMethod.toUpperCase(),
      headers: headers,
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    return await this.HandleResponse(response);
  }

  //async
  postFunction(aFunction,aInput) {
    return this._postLikeFunction('POST',aFunction,aInput);
  }

  //async
  patchFunction(aFunction,aInput) {
    return this._postLikeFunction('PATCH',aFunction,aInput);
  }

  // !!! This works in a browser, but the problem is the URL constructor requires a base url, and how do we get that within node?
  // Might have to find a firebase api or implement url encoding
  // let params = {timezone: this.place.utc_offset || 8};
  // var url = new URL('/api/place_status/'+this.place.id,document.baseURI);
  // Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  // this.status = await this.firebase.getFunction(url.toString());
  async getFunction(aFunction,aParams) {
    if (aParams)
      throw new Error('aParams not actually working yet');


    let headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate'
    };
    let token = await this.getSessionToken();
    if (token)
      headers.Authorization = 'Bearer '+token;
    let response = await fetch(aFunction,{
      method: 'GET',
      headers: headers,
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

FirebaseExtra.timeoutms = 30000;
/**
 * Rejects a promise with a {@link FirebaseTimeout} if it does not settle within
 * the specified timeout.
 *
 * @param {Promise} promise The promise.
 * @param {number} timeoutMillis Number of milliseconds to wait on settling.
 * @returns {Promise} Either resolves/rejects with `promise`, or rejects with
 *                   `TimeoutError`, whichever settles first.
 */
FirebaseExtra.timeout = function(promise, timeoutMillis=null) {
  if (!timeoutMillis)
    timeoutMillis = this.timeoutms;
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

exports.default = FirebaseExtra;
exports.Roles = Roles;
